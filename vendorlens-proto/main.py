from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
import uuid
import json
import asyncio
from datetime import datetime
import pandas as pd
import io

from database import get_db, engine
from models import Base, VendorInput, KybScan, AdverseFinding, ScanSubject
from data_aggregator import aggregate_vendor_data
from llm_service import extract_findings_from_data

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ScanRequest(BaseModel):
    input_id: str
    scan_type: str # quick or deep

def map_excel_columns(row_dict: dict) -> dict:
    """Flexible column mapping logic for Excel uploads."""
    # Convert keys to lower case for easier matching
    normalized_keys = {k.lower().strip(): k for k in row_dict.keys() if isinstance(k, str)}
    
    def get_value(*possible_keys):
        for pk in possible_keys:
            for nk in normalized_keys:
                if pk in nk:
                    val = row_dict[normalized_keys[nk]]
                    # Handle NaNs
                    if pd.isna(val): return ""
                    return str(val).strip()
        return ""

    return {
        "legal_name": get_value("legal_name", "name", "supplier", "vendor name"),
        "website_domain": get_value("website_domain", "domain", "website"),
        "registration_number": get_value("registration_number", "bp number", "vendor id", "reg no"),
        "jurisdiction_country": get_value("jurisdiction_country", "country"),
        "tax_identifier": get_value("tax_identifier", "tax no", "gstin"),
        "registered_address": get_value("registered_address", "address"),
        "director_names": get_value("director_names", "directors", "board"),
        "director_din": get_value("director_din", "din"),
        "founder_ceo_name": get_value("founder_ceo_name", "ceo", "founder"),
        "corporate_email_domain": get_value("corporate_email_domain", "email domain"),
        "pan_number": get_value("pan_number", "pan", "pan no"),
        "city": get_value("city", "location"),
        "mobile_number": get_value("mobile_number", "mobile", "phone"),
        "msmed_certificate_number": get_value("msmed_certificate_number", "msmed", "udyam")
    }

@app.post("/vendor/parse-excel")
async def parse_excel(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), sheet_name=0, dtype=str).fillna("")
        if df.empty:
            raise HTTPException(400, "Excel file is empty")
        
        parsed_vendors = []
        for _, row in df.iterrows():
            row_dict = row.to_dict()
            mapped = map_excel_columns(row_dict)
            if mapped["legal_name"]: # Only include rows with at least a name
                parsed_vendors.append(mapped)
                
        return {"vendors": parsed_vendors}
    except Exception as e:
        raise HTTPException(400, f"Error parsing Excel: {str(e)}")

@app.post("/vendor/intake")
async def create_intake(
    excel_file: UploadFile = File(default=None),
    manual_fields: str = Form(default=None),
    db: Session = Depends(get_db)
):
    try:
        record_data = {}
        source_method = 'manual'
        source_filename = None

        if excel_file:
            contents = await excel_file.read()
            df = pd.read_excel(io.BytesIO(contents), sheet_name=0, dtype=str).fillna("")
            if df.empty:
                raise HTTPException(400, "Excel template has no data row")
            row = df.iloc[0].to_dict()
            record_data = map_excel_columns(row)
            
            # Reformat list fields that were joined by semicolon
            if record_data.get("director_names"):
                record_data["director_names"] = [v.strip() for v in record_data["director_names"].split(";") if v.strip()]
            else:
                record_data["director_names"] = []
                
            if record_data.get("director_din"):
                record_data["director_din"] = [v.strip() for v in record_data["director_din"].split(";") if v.strip()]
            else:
                record_data["director_din"] = []
                
            record_data["social_handles"] = {}

            source_method = 'excel'
            source_filename = excel_file.filename
        elif manual_fields:
            record_data = json.loads(manual_fields)
        else:
            raise HTTPException(400, "Provide either excel_file or manual_fields")

        vendor = VendorInput(
            legal_name=record_data.get('legal_name'),
            website_domain=record_data.get('website_domain'),
            registration_number=record_data.get('registration_number'),
            jurisdiction_country=record_data.get('jurisdiction_country'),
            tax_identifier=record_data.get('tax_identifier'),
            registered_address=record_data.get('registered_address'),
            director_names=record_data.get('director_names', []),
            director_din=record_data.get('director_din', []),
            founder_ceo_name=record_data.get('founder_ceo_name'),
            social_handles=record_data.get('social_handles', {}),
            corporate_email_domain=record_data.get('corporate_email_domain'),
            pan_number=record_data.get('pan_number'),
            city=record_data.get('city'),
            mobile_number=record_data.get('mobile_number'),
            msmed_certificate_number=record_data.get('msmed_certificate_number'),
            source_method=source_method,
            source_filename=source_filename
        )
        db.add(vendor)
        db.commit()
        db.refresh(vendor)

        return {
            "input_id": vendor.input_id,
            "source_method": vendor.source_method,
            "deep_diligence_ready": True
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(400, str(e))

async def run_scan_workflow(scan_id: str, input_id: str, scan_type: str):
    db = next(get_db())
    try:
        vendor = db.query(VendorInput).filter(VendorInput.input_id == input_id).first()
        if not vendor:
            return

        # Fetch Data
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

        # Simulate delay to match "processing time" expectations
        await asyncio.sleep(3)

        findings, tokens_used = await extract_findings_from_data(aggregated_data)

        # PRD Scoring logic simulation
        critical_count = sum(1 for f in findings if f['severity'] == 'critical')
        high_count = sum(1 for f in findings if f['severity'] == 'high')
        medium_count = sum(1 for f in findings if f['severity'] == 'medium')
        
        overall_risk = 'CLEAN'
        if critical_count > 0: overall_risk = 'CRITICAL'
        elif high_count > 0: overall_risk = 'HIGH'
        elif medium_count > 0: overall_risk = 'MEDIUM'
        elif len(findings) > 0: overall_risk = 'LOW'

        scan = db.query(KybScan).filter(KybScan.scan_id == scan_id).first()
        scan.status = 'COMPLETED'
        scan.overall_risk_level = overall_risk
        scan.total_findings = len(findings)
        scan.completed_at = datetime.utcnow()
        scan.raw_data_summary = {"findings_by_category": {
            "sanctions": critical_count,
            "adverse_media": high_count,
            "domain_anomaly": medium_count
        }}

        for f in findings:
            finding = AdverseFinding(
                scan_id=scan_id,
                subject_type="ENTITY",
                subject_name=vendor.legal_name,
                category=f.get('finding_type', 'other'),
                severity=f.get('severity', 'low').upper(),
                confidence_score=int(f.get('confidence_score', 0) * 10),
                title=f.get('title', 'Finding'),
                detail=f.get('description', ''),
                source_tool=f.get('source_api', ''),
                source_name=f.get('source_api', ''),
                raw_excerpt=f.get('description', '')
            )
            db.add(finding)

        db.commit()

    except Exception as e:
        print(f"Scan failed: {e}")
        scan = db.query(KybScan).filter(KybScan.scan_id == scan_id).first()
        if scan:
            scan.status = 'ERROR'
            db.commit()

@app.post("/scan")
async def run_scan(payload: ScanRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    vendor = db.query(VendorInput).filter(VendorInput.input_id == payload.input_id).first()
    if not vendor:
        raise HTTPException(404, "Unknown input_id")

    scan = KybScan(
        input_id=payload.input_id,
        scan_type=payload.scan_type,
        status="RUNNING"
    )
    db.add(scan)
    db.commit()
    db.refresh(scan)

    background_tasks.add_task(run_scan_workflow, scan.scan_id, payload.input_id, payload.scan_type)

    return {
        "scan_id": scan.scan_id,
        "input_id": payload.input_id,
        "status": "RUNNING",
        "scan_type": payload.scan_type,
    }

@app.get("/scan/{scan_id}/status")
async def get_scan_status(scan_id: str, db: Session = Depends(get_db)):
    scan = db.query(KybScan).filter(KybScan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(404, "Scan not found")
    return {"status": scan.status}

@app.get("/scan/{scan_id}/report")
async def get_report(scan_id: str, db: Session = Depends(get_db)):
    scan = db.query(KybScan).filter(KybScan.scan_id == scan_id).first()
    if not scan:
        raise HTTPException(404, "Scan not found")
    
    vendor = db.query(VendorInput).filter(VendorInput.input_id == scan.input_id).first()

    findings = db.query(AdverseFinding).filter(AdverseFinding.scan_id == scan_id).all()
    
    findings_list = []
    for f in findings:
        findings_list.append({
            "finding_id": f.finding_id,
            "subject_type": f.subject_type,
            "subject_name": f.subject_name,
            "category": f.category,
            "severity": f.severity,
            "title": f.title,
            "detail": f.detail,
            "evidence": {
                "source_tool": f.source_tool,
                "source_name": f.source_name,
                "raw_excerpt": f.raw_excerpt
            }
        })

    return {
        "subject": {
            "legal_name": vendor.legal_name,
            "domain": vendor.website_domain,
            "scan_timestamp": scan.scan_timestamp.isoformat() if scan.scan_timestamp else None,
            "scan_type": scan.scan_type
        },
        "risk_summary": {
            "overall_risk_level": scan.overall_risk_level,
            "total_adverse_findings": scan.total_findings,
            "findings_by_category": scan.raw_data_summary.get("findings_by_category", {}) if scan.raw_data_summary else {}
        },
        "adverse_findings": findings_list
    }
