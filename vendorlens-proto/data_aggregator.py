from apis import (
    opencorp, opensanctions, gdelt, whois_api, ssl_api, sandbox_api,
    serper_api, news_api, google_places_api, microlink_api
)
import asyncio
import logging
from typing import Optional

logger = logging.getLogger(__name__)

async def _safe_call(api_name, coro):
    try:
        return api_name, await coro
    except Exception as e:
        logger.error(f"{api_name} Aggregation failed: {e}")
        return api_name, {"error": str(e)}

async def _gather_sanctions(all_names):
    sanctions_results = {}
    for name in all_names:
        if name:
            sanctions_results[name] = await opensanctions.search_entity(name)
    return sanctions_results

async def _gather_gdelt(legal_name, founder_ceo_name):
    news_results = {}
    news_results[legal_name] = await gdelt.search_news(legal_name)
    if founder_ceo_name:
        news_results[founder_ceo_name] = await gdelt.search_news(founder_ceo_name)
    return news_results

async def _gather_sandbox(jurisdiction_country, tax_identifier, pan_number, msmed_certificate_number):
    if jurisdiction_country and jurisdiction_country.upper() == "IN":
        tsp_results = {}
        if tax_identifier:
            tsp_results["gstin"] = await sandbox_api.verify_gstin(tax_identifier)
        if pan_number:
            tsp_results["pan"] = await sandbox_api.verify_pan(pan_number)
        if msmed_certificate_number:
            tsp_results["msmed"] = await sandbox_api.verify_msmed(msmed_certificate_number)
        return tsp_results
    return {}

async def _async_return(val):
    return val

async def aggregate_vendor_data(
    legal_name: str,
    website_domain: Optional[str],
    registration_number: Optional[str],
    jurisdiction_country: Optional[str],
    director_names: list[str],
    director_din: list[str],
    founder_ceo_name: Optional[str],
    tax_identifier: Optional[str] = None,
    pan_number: Optional[str] = None,
    msmed_certificate_number: Optional[str] = None
) -> dict:
    """
    Call all APIs asynchronously and aggregate results.
    """
    all_names = [legal_name] + (director_names or [])
    if founder_ceo_name and founder_ceo_name not in all_names:
        all_names.append(founder_ceo_name)

    tasks = [
        _safe_call("opencorporates", opencorp.search_company(
            legal_name, jurisdiction=jurisdiction_country.lower() if jurisdiction_country else "us"
        )),
        _safe_call("opensanctions", _gather_sanctions(all_names)),
        _safe_call("gdelt", _gather_gdelt(legal_name, founder_ceo_name)),
        _safe_call("serper", serper_api.search(f"{legal_name} official website fraud reviews")),
        _safe_call("newsapi", news_api.search_news(f"{legal_name} AND (fraud OR scandal OR lawsuit)")),
    ]

    if website_domain:
        tasks.extend([
            _safe_call("whois", whois_api.search_domain(website_domain)),
            _safe_call("ssl", ssl_api.check_ssl(website_domain)),
            _safe_call("microlink", microlink_api.get_metadata(website_domain)),
        ])
    else:
        tasks.extend([
            _safe_call("whois", _async_return({"error": "No domain provided"})),
            _safe_call("ssl", _async_return({"error": "No domain provided"})),
            _safe_call("microlink", _async_return({"error": "No domain provided"})),
        ])

    address_query = f"{legal_name} {jurisdiction_country or ''}"
    tasks.append(_safe_call("google_places", google_places_api.search_address(address_query)))

    tasks.append(_safe_call("sandbox_tsp", _gather_sandbox(
        jurisdiction_country, tax_identifier, pan_number, msmed_certificate_number
    )))

    results = await asyncio.gather(*tasks)
    aggregated = {k: v for k, v in results}
    return aggregated
