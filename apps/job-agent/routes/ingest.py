from fastapi import APIRouter, HTTPException

from models import ScrapeRequest, ScrapeResponse
from services.ingest import scrape_jobs

router = APIRouter()


@router.post("/greenhouse", response_model=ScrapeResponse)
async def ingest_greenhouse(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("greenhouse", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/lever", response_model=ScrapeResponse)
async def ingest_lever(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("lever", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/ashby", response_model=ScrapeResponse)
async def ingest_ashby(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("ashby", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/workable", response_model=ScrapeResponse)
async def ingest_workable(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("workable", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/recruitee", response_model=ScrapeResponse)
async def ingest_recruitee(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("recruitee", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/personio", response_model=ScrapeResponse)
async def ingest_personio(payload: ScrapeRequest) -> ScrapeResponse:
    try:
        return await scrape_jobs("personio", payload)
    except Exception as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
