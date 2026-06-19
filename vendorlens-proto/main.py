from fastapi import FastAPI, Depends, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database import get_db, engine
from models import VendorInput, VendorRiskReport, Base
from data_aggregator import aggregate_vendor_data
from llm_service import extract_findings_from_data
from risk_scorer import score_findings
from token_manager import token_manager
import json
import pandas as pd
from typing import Optional
import io
import math
import re

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="VendorLens Prototype")

# Enable CORS for frontend testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ PYDANTIC MODELS ============

class VendorIntakeResponse(BaseModel):
    input_id: str
    legal_name: str
    message: str

class FindingResponse(BaseModel):
    finding_type: str
    severity: str
    title: str
    description: str
    source_api: str
    confidence_score: float

class RiskReportResponse(BaseModel):
    report_id: str
    overall_risk_tier: str
    risk_score: float
    summary: str
    findings: list[FindingResponse]
    recommendations: str
    tokens_used: int
    tokens_remaining: int

# ============ ENDPOINTS ============

def _clean_str(val) -> Optional[str]:
    if pd.isna(val):
        return None
    s = str(val).strip()
    return s if s else None

def _split_list(val) -> list[str]:
    if pd.isna(val):
        return []
    s = str(val).strip()
    return [v.strip() for v in s.split(";") if v.strip()] if s else []

COLUMN_MAP = {
    "legal_name": ["legal_name", "legal name", "name", "company_name", "company", "entity_name", "supplier"],
    "website_domain": ["website_domain", "website", "website url", "domain", "website_domain_name", "web site", "url"],
    "registration_number": ["registration_number", "registration no", "registration no.", "registration", "reg no", "reg_number", "bp number", "bp_number"],
    "jurisdiction_country": ["jurisdiction_country", "country", "jurisdiction", "country_code", "jurisdiction country"],
    "tax_identifier": ["tax_identifier", "tax id", "tax_id", "tax identifier", "gstin", "gstin-tax no3", "gstin_tax_no3", "pan"],
    "registered_address": ["registered_address", "address", "registered address", "registered_addr", "street", "street 2", "street 3", "city", "district", "postal code", "postl code"],
    "director_names": ["director_names", "directors", "director name", "director_names_list"],
    "director_din": ["director_din", "din", "director din", "director_identification_number"],
    "founder_ceo_name": ["founder_ceo_name", "founder", "ceo_name", "founder name", "ceo"],
    "social_handles": ["social_handles", "social media", "social accounts", "social handles"],
    "corporate_email_domain": ["corporate_email_domain", "email_domain", "corporate email", "email domain"],
    "email_address": ["email_address", "e_mail_address", "email address", "e-mail address", "email"],
    "pan_number": ["pan_number", "pan", "pan no", "pan_number"],
    "city": ["city", "town", "location"],
    "mobile_number": ["mobile_number", "phone", "mobile", "mobile no", "phone_number", "contact_number"],
    "msmed_certificate_number": ["msmed_certificate_number", "msmed", "udyam_no", "udyam", "msmed certificate", "msmed number", "msmed cerificate no", "msmed certificate no"],
}

def normalize_column_name(name: str) -> str:
    if not isinstance(name, str):
        return ""
    normalized = re.sub(r"[^a-z0-9]", "_", name.strip().lower())
    normalized = re.sub(r"_+", "_", normalized).strip("_")
    return normalized


def _normalize_domain(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    s = str(value).strip().lower()
    s = re.sub(r"^https?://", "", s)
    s = re.sub(r"^www\\.", "", s)
    s = s.split("/", 1)[0].split("?", 1)[0]
    return s if s else None


def _find_email_column(columns: list[str]) -> Optional[str]:
    normalized = {normalize_column_name(col): col for col in columns}
    email_candidates = [
        "email_address",
        "e_mail_address",
        "email",
        "e-mail address",
        "corporate_email_domain",
        "email_domain",
        "corporate email",
        "email domain",
    ]
    for alias in email_candidates:
        found = normalized.get(normalize_column_name(alias))
        if found:
            return found
    for col in columns:
        if "email" in normalize_column_name(col) or "e_mail" in normalize_column_name(col):
            return col
    return None

def map_columns(columns: list[str]) -> dict[str, str]:
    mapped = {}
    normalized_columns = {normalize_column_name(col): col for col in columns}
    for key, aliases in COLUMN_MAP.items():
        for alias in aliases:
            normalized_alias = normalize_column_name(alias)
            if normalized_alias in normalized_columns:
                mapped[key] = normalized_columns[normalized_alias]
                break
    return mapped

@app.post("/api/v1/vendor/intake", response_model=VendorIntakeResponse)
async def intake_vendor_excel(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Accept vendor data via Excel upload and store in DB."""
    if not file.filename.endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are supported")
    
    try:
        contents = await file.read()
        try:
            df = pd.read_excel(io.BytesIO(contents), sheet_name="Vendor_Intake", dtype=str)
        except ValueError:
            df = pd.read_excel(io.BytesIO(contents), sheet_name=0, dtype=str)
        if df.empty:
            raise HTTPException(status_code=400, detail="Excel template has no data row")
        
        columns = list(df.columns)
        col_map = map_columns(columns)
        
        if "legal_name" not in col_map:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Excel must contain a legal_name column. "
                    f"Detected columns: {columns}"
                )
            )
        
        row = df.iloc[0] # Single vendor per upload
        
        legal_name = _clean_str(row.get(col_map["legal_name"]))
        website_domain = _normalize_domain(_clean_str(row.get(col_map.get("website_domain", "")))) if "website_domain" in col_map else None
        
        if not legal_name:
            raise HTTPException(status_code=400, detail="Excel must contain legal_name values")

        if not website_domain:
            # If no website is provided, try to infer from email if available
            email_col = col_map.get("email_address") or col_map.get("corporate_email_domain") or _find_email_column(columns)
            if email_col:
                email_value = _clean_str(row.get(email_col))
                if email_value and "@" in email_value:
                    website_domain = _normalize_domain(email_value.split("@", 1)[1])
        
        if not website_domain:
            raise HTTPException(status_code=400, detail="Excel must contain website_domain or email address values")

        social_handles = {}
        for alias, platform in [("linkedin", "linkedin"), ("twitter", "twitter"), ("facebook", "facebook")]:
            for col in columns:
                if normalize_column_name(col).startswith(alias):
                    val = _clean_str(row.get(col))
                    if val:
                        social_handles[platform] = val
                        break

        def get_mapped_value(field_name: str):
            return _clean_str(row.get(col_map[field_name])) if field_name in col_map else None

        def get_mapped_list(field_name: str):
            return _split_list(row.get(col_map[field_name])) if field_name in col_map else []

        vendor = VendorInput(
            legal_name=legal_name,
            website_domain=website_domain,
            registration_number=get_mapped_value("registration_number"),
            jurisdiction_country=get_mapped_value("jurisdiction_country"),
            tax_identifier=get_mapped_value("tax_identifier"),
            registered_address=get_mapped_value("registered_address"),
            director_names=get_mapped_list("director_names"),
            director_din=get_mapped_list("director_din"),
            founder_ceo_name=get_mapped_value("founder_ceo_name"),
            social_handles=social_handles,
            corporate_email_domain=get_mapped_value("corporate_email_domain"),
            pan_number=get_mapped_value("pan_number"),
            city=get_mapped_value("city"),
            mobile_number=get_mapped_value("mobile_number"),
            msmed_certificate_number=get_mapped_value("msmed_certificate_number"),
            source_method="excel",
            source_filename=file.filename
        )
        
        db.add(vendor)
        db.commit()
        db.refresh(vendor)
        
        return VendorIntakeResponse(
            input_id=vendor.input_id,
            legal_name=vendor.legal_name,
            message="Vendor intake recorded from Excel. Call /scan to start screening."
        )
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to process Excel file: {str(e)}")

@app.post("/api/v1/scan/{input_id}", response_model=RiskReportResponse)
async def scan_vendor(input_id: str, db: Session = Depends(get_db)):
    """
    Scan a vendor: aggregate data + LLM analysis + scoring.
    """
    # Check token balance first
    if token_manager.get_balance() <= 0:
        raise HTTPException(status_code=402, detail="Insufficient tokens to perform scan.")
        
    try:
        # 1. Get vendor input
        vendor = db.query(VendorInput).filter(VendorInput.input_id == input_id).first()
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")
        
        # 2. Aggregate data
        aggregated_data = await aggregate_vendor_data(
            legal_name=vendor.legal_name,
            website_domain=vendor.website_domain,
            registration_number=vendor.registration_number,
            jurisdiction_country=vendor.jurisdiction_country,
            director_names=vendor.director_names or [],
            director_din=vendor.director_din or [],
            founder_ceo_name=vendor.founder_ceo_name,
            tax_identifier=vendor.tax_identifier,
            pan_number=vendor.pan_number,
            msmed_certificate_number=vendor.msmed_certificate_number
        )
        
        # 3. Extract findings via LLM
        findings, tokens_used = await extract_findings_from_data(aggregated_data)
        
        # Deduct tokens (if not enough, fallback but we checked earlier)
        # We assume 1 token = 1 unit for now, or just subtract tokens_used
        # If tokens_used is higher than balance, they just go to 0 or negative.
        if token_manager.get_balance() >= tokens_used:
             token_manager.deduct(tokens_used)
        else:
             token_manager.deduct(token_manager.get_balance()) # drain it
             
        # 4. Score findings
        risk_result = score_findings(findings)
        
        # 5. Save report
        report = VendorRiskReport(
            input_id=input_id,
            overall_risk_tier=risk_result["tier"],
            risk_score=risk_result["score"],
            summary=risk_result["summary"],
            critical_count=risk_result["critical"],
            high_count=risk_result["high"],
            medium_count=risk_result["medium"],
            low_count=risk_result["low"],
            findings_count=len(findings),
            findings_json=findings,
            recommendations=risk_result["recommendations"],
            raw_api_data=aggregated_data
        )
        db.add(report)
        db.commit()
        db.refresh(report)
        
        return RiskReportResponse(
            report_id=report.report_id,
            overall_risk_tier=report.overall_risk_tier,
            risk_score=float(report.risk_score),
            summary=report.summary,
            findings=[FindingResponse(**f) for f in report.findings_json],
            recommendations=report.recommendations,
            tokens_used=tokens_used,
            tokens_remaining=token_manager.get_balance()
        )
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Scan failed: {str(e)}")

@app.get("/api/v1/report/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)):
    """Retrieve a previous report."""
    report = db.query(VendorRiskReport).filter(VendorRiskReport.report_id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    return {
        "report_id": report.report_id,
        "overall_risk_tier": report.overall_risk_tier,
        "risk_score": float(report.risk_score),
        "summary": report.summary,
        "findings": report.findings_json,
        "recommendations": report.recommendations,
        "created_at": report.created_at.isoformat(),
        "input_id": report.input_id
    }

@app.get("/health")
async def health_check():
    """Health check for load balancer."""
    return {"status": "healthy"}
