from apis import opencorp, opensanctions, gdelt, whois_api, ssl_api
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

async def aggregate_vendor_data(
    legal_name: str,
    website_domain: Optional[str],
    registration_number: Optional[str],
    jurisdiction_country: Optional[str],
    director_names: list[str],
    director_din: list[str],
    founder_ceo_name: Optional[str]
) -> dict:
    """
    Call all 5 APIs sequentially and aggregate results.
    For prototype, we don't parallelize to keep it simple and stable.
    """
    
    aggregated = {
        "opencorporates": {},
        "opensanctions": {},
        "gdelt": {},
        "whois": {},
        "ssl": {}
    }
    
    try:
        # 1. OpenCorporates: Search for company
        logger.info(f"Searching OpenCorporates for {legal_name}...")
        aggregated["opencorporates"] = await opencorp.search_company(
            legal_name, 
            jurisdiction=jurisdiction_country.lower() if jurisdiction_country else "us"
        )
    except Exception as e:
        logger.error(f"OpenCorporates Aggregation failed: {e}")
        aggregated["opencorporates"] = {"error": str(e)}

    try:
        # 2. OpenSanctions: Check entity + directors + CEO
        logger.info(f"Searching OpenSanctions for {legal_name} and officers...")
        all_names = [legal_name] + (director_names or [])
        if founder_ceo_name and founder_ceo_name not in all_names:
            all_names.append(founder_ceo_name)
            
        sanctions_results = {}
        for name in all_names:
            if not name:
                continue
            res = await opensanctions.search_entity(name)
            sanctions_results[name] = res
            
        aggregated["opensanctions"] = sanctions_results
    except Exception as e:
        logger.error(f"OpenSanctions Aggregation failed: {e}")
        aggregated["opensanctions"] = {"error": str(e)}

    try:
        # 3. GDELT: Search for adverse news on company and CEO
        logger.info(f"Searching GDELT for news about {legal_name}...")
        news_results = {}
        news_results[legal_name] = await gdelt.search_news(legal_name)
        if founder_ceo_name:
            news_results[founder_ceo_name] = await gdelt.search_news(founder_ceo_name)
            
        aggregated["gdelt"] = news_results
    except Exception as e:
        logger.error(f"GDELT Aggregation failed: {e}")
        aggregated["gdelt"] = {"error": str(e)}
        
    try:
        # 4. WHOIS API
        if website_domain:
            logger.info(f"Searching WHOIS for domain {website_domain}...")
            aggregated["whois"] = await whois_api.search_domain(website_domain)
    except Exception as e:
        logger.error(f"WHOIS Aggregation failed: {e}")
        aggregated["whois"] = {"error": str(e)}
        
    try:
        # 5. SSL Check API
        if website_domain:
            logger.info(f"Checking SSL for domain {website_domain}...")
            aggregated["ssl"] = await ssl_api.check_ssl(website_domain)
    except Exception as e:
        logger.error(f"SSL Aggregation failed: {e}")
        aggregated["ssl"] = {"error": str(e)}
        
    return aggregated
