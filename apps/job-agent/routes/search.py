"""Search endpoint — scrape seeded companies and filter jobs by title keyword."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from models import SearchRequest, SearchResponse, SearchResult
from services.company_scrape import scrape_company_jobs
from services.dedup import dedupe_search_results
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


@router.post("", response_model=SearchResponse)
async def search_jobs(payload: SearchRequest) -> SearchResponse:
    companies = await fetch_normalized_companies()
    pilot = [
        c
        for c in companies
        if c.get("ats_type") and c.get("ats_slug")
    ][: payload.max_companies]

    tasks = [
        scrape_company_jobs(company, payload.max_jobs_per_company)
        for company in pilot
    ]
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[SearchResult] = []
    companies_scraped = 0
    for result in results_lists:
        if isinstance(result, list):
            companies_scraped += 1
            all_results.extend(
                job for job in result if _title_matches(job.title, payload.job_title)
            )

    all_results = dedupe_search_results(all_results)

    return SearchResponse(
        query=payload.job_title,
        companies_scraped=companies_scraped,
        total_matches=len(all_results),
        jobs=all_results,
    )
