"""Search endpoint — scrape YC companies and filter jobs by title keyword."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from models import ScrapeRequest, SearchRequest, SearchResponse, SearchResult
from services.ingest import scrape_jobs
from services.parsers.yc import fetch_normalized_companies

logger = logging.getLogger(__name__)

router = APIRouter()


def _title_matches(job_title: str, query: str) -> bool:
    query_lower = query.lower()
    title_lower = job_title.lower()
    query_words = [w for w in query_lower.split() if len(w) > 1]
    if not query_words:
        return query_lower in title_lower
    return any(word in title_lower for word in query_words)


async def _search_company(
    company: dict[str, object],
    query: str,
    max_jobs: int,
) -> list[SearchResult]:
    ats_type = str(company.get("ats_type", ""))
    ats_slug = str(company.get("ats_slug", ""))
    company_name = str(company.get("name", ""))
    domain = str(company.get("domain", ""))

    if ats_type not in {"greenhouse", "lever"} or not ats_slug:
        return []

    try:
        response = await scrape_jobs(
            ats_type,  # type: ignore[arg-type]
            ScrapeRequest(ats_slug=ats_slug, company_id=domain),
        )
    except Exception as exc:
        logger.warning("Failed to scrape %s (%s): %s", company_name, ats_type, exc)
        return []

    results: list[SearchResult] = []
    for job in response.jobs[:max_jobs]:
        if _title_matches(job.title, query):
            results.append(
                SearchResult(
                    external_id=job.external_id,
                    source=job.source,
                    title=job.title,
                    company_name=company_name,
                    department=job.department,
                    location=job.location,
                    location_type=job.location_type,
                    seniority=job.seniority,
                    application_url=job.application_url,
                    dedup_key=job.dedup_key,
                    ats_type=ats_type,
                    ats_slug=ats_slug,
                )
            )
    return results


@router.post("", response_model=SearchResponse)
async def search_jobs(payload: SearchRequest) -> SearchResponse:
    companies = await fetch_normalized_companies()
    pilot = [
        c
        for c in companies
        if c.get("ats_type") and c.get("ats_slug")
    ][: payload.max_companies]

    tasks = [
        _search_company(company, payload.job_title, payload.max_jobs_per_company)
        for company in pilot
    ]
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[SearchResult] = []
    companies_scraped = 0
    for result in results_lists:
        if isinstance(result, list):
            companies_scraped += 1
            all_results.extend(result)

    return SearchResponse(
        query=payload.job_title,
        companies_scraped=companies_scraped,
        total_matches=len(all_results),
        jobs=all_results,
    )
