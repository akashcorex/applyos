"""Semantic search endpoint — scrape jobs then rank with embeddings."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from models import (
    SearchResult,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticMatchResult,
)
from services.company_scrape import scrape_company_jobs
from services.search_inventory import get_searchable_companies
from services.dedup import dedupe_search_results
from services.semantic_match import semantic_rank_jobs

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(payload: SemanticSearchRequest) -> SemanticSearchResponse:
    companies = get_searchable_companies(payload.max_companies)

    tasks = [
        scrape_company_jobs(company, payload.max_jobs_per_company)
        for company in companies
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
