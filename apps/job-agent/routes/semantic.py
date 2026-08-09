"""Semantic search endpoint — scrape jobs then rank with embeddings."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from models import (
    ScrapeRequest,
    SearchResult,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticMatchResult,
)
from services.ingest import scrape_jobs
from services.parsers.yc import fetch_normalized_companies
from services.dedup import dedupe_search_results
from services.semantic_match import semantic_rank_jobs

logger = logging.getLogger(__name__)

router = APIRouter()


async def _scrape_company_semantic(
    company: dict[str, object],
    max_jobs: int,
) -> list[SearchResult]:
    """Scrape all jobs from a company — no title keyword prefilter."""
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
        description = job.description_raw or job.description_html
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
                description=description,
            )
        )
    return results


@router.post("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(payload: SemanticSearchRequest) -> SemanticSearchResponse:
    companies = await fetch_normalized_companies()
    pilot = [
        c
        for c in companies
        if c.get("ats_type") and c.get("ats_slug")
    ][: payload.max_companies]

    tasks = [
        _scrape_company_semantic(company, payload.max_jobs_per_company)
        for company in pilot
    ]
    results_lists = await asyncio.gather(*tasks, return_exceptions=True)

    all_results: list[SearchResult] = []
    companies_scraped = 0
    for result in results_lists:
        if isinstance(result, list):
            companies_scraped += 1
            all_results.extend(result)

    all_results = dedupe_search_results(all_results)

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
    )
