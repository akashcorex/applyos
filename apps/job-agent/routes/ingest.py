from fastapi import APIRouter

from models import ScrapeRequest, ScrapeResponse
from services.http_errors import raise_bad_gateway
from services.ingest import scrape_jobs

router = APIRouter()


@router.post("/greenhouse", response_model=ScrapeResponse)
async def ingest_greenhouse(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("greenhouse", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Greenhouse")


@router.post("/lever", response_model=ScrapeResponse)
async def ingest_lever(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("lever", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Lever")


@router.post("/ashby", response_model=ScrapeResponse)
async def ingest_ashby(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("ashby", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Ashby")


@router.post("/workable", response_model=ScrapeResponse)
async def ingest_workable(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("workable", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Workable")


@router.post("/recruitee", response_model=ScrapeResponse)
async def ingest_recruitee(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("recruitee", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Recruitee")


@router.post("/personio", response_model=ScrapeResponse)
async def ingest_personio(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("personio", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Personio")


@router.post("/wellfound", response_model=ScrapeResponse)
async def ingest_wellfound(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("wellfound", payload)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to ingest jobs from Wellfound")
