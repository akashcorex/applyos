from fastapi import APIRouter

from models import FundingScrapeRequest, FundingScrapeResponse
from services.funding import list_funding_sources, scrape_funding
from services.http_errors import raise_bad_gateway

router = APIRouter()


@router.get("/sources")
async def funding_sources() -> dict[str, list[str]]:
    return {"sources": list_funding_sources()}


@router.post("/scrape", response_model=FundingScrapeResponse)
async def funding_scrape(payload: FundingScrapeRequest) -> FundingScrapeResponse:
    try:
        return await scrape_funding(payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to scrape funding data")
