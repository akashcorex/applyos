"""Search endpoint — scrape seeded companies and filter jobs by title keyword."""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter

from models import BoardAttempt, SearchRequest, SearchResponse, SearchResult
from services.board_audit import probe_url_for
from services.company_scrape import scrape_company_jobs
from services.dedup import dedupe_search_results
from services.freshness import apply_freshness_metadata, sort_by_freshness
from services.search_inventory import get_searchable_companies
from services.seniority import seniority_allowed

logger = logging.getLogger(__name__)

router = APIRouter()

_ERROR_PREVIEW_CHARS = 200


def _title_matches(job_title: str, query: str) -> bool:
    query_lower = query.lower()
    title_lower = job_title.lower()
    query_words = [w for w in query_lower.split() if len(w) > 1]
    if not query_words:
        return query_lower in title_lower
    return any(word in title_lower for word in query_words)


async def _scrape_with_attempt(
    company: dict[str, object], max_jobs: int
) -> tuple[list[SearchResult] | BaseException, BoardAttempt]:
    started = time.perf_counter()
    try:
        jobs, via_fallback = await scrape_company_jobs(company, max_jobs)
    except Exception as exc:
        attempt = BoardAttempt(
            domain=str(company.get("domain", "")),
            company_name=str(company.get("name", "")),
            ats_type=str(company.get("ats_type", "")),
            ats_slug=str(company.get("ats_slug", "")),
            probe_url=probe_url_for(
                str(company.get("ats_type", "")),
                str(company.get("ats_slug", "")),
            ),
            status="error",
            error=str(exc)[:_ERROR_PREVIEW_CHARS],
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return exc, attempt
    attempt = BoardAttempt(
        domain=str(company.get("domain", "")),
        company_name=str(company.get("name", "")),
        ats_type=str(company.get("ats_type", "")),
        ats_slug=str(company.get("ats_slug", "")),
        probe_url=probe_url_for(
            str(company.get("ats_type", "")),
            str(company.get("ats_slug", "")),
        ),
        status="ok" if jobs else "empty",
        jobs_found=len(jobs),
        sample_titles=[job.title for job in jobs[:3] if job.title],
        latency_ms=int((time.perf_counter() - started) * 1000),
        via_fallback=via_fallback,
    )
    return jobs, attempt


@router.post("", response_model=SearchResponse)
async def search_jobs(payload: SearchRequest) -> SearchResponse:
    companies = get_searchable_companies(payload.max_companies)

    tasks = [
        _scrape_with_attempt(company, payload.max_jobs_per_company)
        for company in companies
    ]
    paired = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[SearchResult] = []
    board_attempts: list[BoardAttempt] = []
    companies_scraped = 0
    for result in paired:
        if isinstance(result, BaseException):
            continue
        jobs_or_error, attempt = result
        board_attempts.append(attempt)
        if isinstance(jobs_or_error, list):
            companies_scraped += 1
            all_results.extend(
                job
                for job in jobs_or_error
                if _title_matches(job.title, payload.job_title)
            )

    all_results = dedupe_search_results(all_results)
    all_results = [
        job
        for job in all_results
        if seniority_allowed(payload.experience_years, job.seniority, job.title)
    ]
    all_results = apply_freshness_metadata(all_results)
    all_results = sort_by_freshness(all_results)

    return SearchResponse(
        query=payload.job_title,
        companies_scraped=companies_scraped,
        total_matches=len(all_results),
        jobs=all_results,
        board_attempts=board_attempts,
    )
