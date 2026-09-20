"""Semantic search endpoint — scrape jobs then rank with embeddings."""

from __future__ import annotations

import asyncio
import logging
import time

from fastapi import APIRouter

from models import (
    BoardAttempt,
    SearchResult,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticMatchResult,
)
from services.board_audit import probe_url_for
from services.company_scrape import scrape_company_jobs
from services.search_inventory import get_searchable_companies
from services.dedup import dedupe_search_results
from services.freshness import apply_freshness_metadata, sort_by_freshness
from services.semantic_match import semantic_rank_jobs

logger = logging.getLogger(__name__)

router = APIRouter()

_ERROR_PREVIEW_CHARS = 200


async def _scrape_with_attempt(
    company: dict[str, object], max_jobs: int
) -> tuple[list[SearchResult] | BaseException, BoardAttempt]:
    started = time.perf_counter()
    try:
        jobs = await scrape_company_jobs(company, max_jobs)
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
    )
    return jobs, attempt


@router.post("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(payload: SemanticSearchRequest) -> SemanticSearchResponse:
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
            all_results.extend(jobs_or_error)

    all_results = dedupe_search_results(all_results)
    all_results = apply_freshness_metadata(all_results)
    all_results = sort_by_freshness(all_results)

    ranked: list[SemanticMatchResult] = await semantic_rank_jobs(
        all_results,
        skills=payload.skills,
        preferred_role=payload.job_title,
        experience_years=payload.experience_years,
        summary=payload.summary,
        recent_role=payload.recent_role,
        recent_highlights=payload.recent_highlights,
        profile_embedding=payload.profile_embedding,
        intent_override=payload.intent_override,
    )

    return SemanticSearchResponse(
        query=payload.job_title,
        companies_scraped=companies_scraped,
        jobs_scraped=len(all_results),
        total_matches=len(ranked),
        jobs=ranked,
        board_attempts=board_attempts,
    )
