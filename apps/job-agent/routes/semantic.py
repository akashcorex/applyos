"""Semantic search endpoint — scrape jobs then rank with LLM."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter

from models import (
    ScrapeRequest,
    SemanticSearchRequest,
    SemanticSearchResponse,
    SemanticMatchResult,
)
from routes.search import _search_company
from services.ingest import scrape_jobs
from services.parsers.yc import fetch_normalized_companies
from services.semantic_match import semantic_rank_jobs

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/semantic", response_model=SemanticSearchResponse)
async def semantic_search(payload: SemanticSearchRequest) -> SemanticSearchResponse:
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

    all_results: list = []
    companies_scraped = 0
    for result in results_lists:
        if isinstance(result, list):
            companies_scraped += 1
            all_results.extend(result)

    ranked: list[SemanticMatchResult] = await semantic_rank_jobs(
        all_results,
        skills=payload.skills,
        preferred_role=payload.job_title,
        experience_years=payload.experience_years,
    )

    return SemanticSearchResponse(
        query=payload.job_title,
        companies_scraped=companies_scraped,
        total_matches=len(ranked),
        jobs=ranked,
    )
