from fastapi import APIRouter
from pydantic import BaseModel, Field

from models import SearchResult
from services.http_errors import raise_bad_gateway
from services.job_detail import fetch_job_description
from services.page_scrape import scrape_career_page

router = APIRouter()


class PageScrapeRequest(BaseModel):
    career_page_url: str = Field(min_length=8, max_length=500)
    job_role: str | None = Field(default=None, max_length=128)
    company_name: str | None = Field(default=None, max_length=128)


class PageScrapeResponse(BaseModel):
    career_page_url: str
    jobs_found: int
    jobs: list[SearchResult]


@router.post("/page", response_model=PageScrapeResponse)
async def scrape_page(payload: PageScrapeRequest) -> PageScrapeResponse:
    try:
        jobs = await scrape_career_page(
            payload.career_page_url,
            job_role=payload.job_role,
            company_name=payload.company_name,
        )
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to scrape career page")

    return PageScrapeResponse(
        career_page_url=payload.career_page_url,
        jobs_found=len(jobs),
        jobs=jobs,
    )


class DescriptionRequest(BaseModel):
    job_url: str = Field(min_length=8, max_length=500)


class DescriptionResponse(BaseModel):
    job_url: str
    description: str | None = None
    confident: bool = False


@router.post("/description", response_model=DescriptionResponse)
async def scrape_description(payload: DescriptionRequest) -> DescriptionResponse:
    try:
        description, confident = await fetch_job_description(payload.job_url)
    except Exception as error:
        raise_bad_gateway(error, public_message="Failed to read job description")

    return DescriptionResponse(
        job_url=payload.job_url, description=description, confident=confident
    )
