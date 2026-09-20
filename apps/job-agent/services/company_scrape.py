"""Shared company-board scrape used by keyword and semantic search."""

from __future__ import annotations

import logging

from models import ScrapeRequest, SearchResult
from services.board_cache import get_cached_jobs, set_cached_jobs
from services.board_registry import get_board_registry
from services.ingest import PARSERS, scrape_jobs

logger = logging.getLogger(__name__)

SEARCHABLE_ATS = frozenset(PARSERS.keys())


def canonical_to_search_result(
    job,
    *,
    company_name: str,
    ats_type: str,
    ats_slug: str,
) -> SearchResult:
    description = getattr(job, "description_raw", None) or getattr(
        job, "description_html", None
    )
    return SearchResult(
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
        posted_at=getattr(job, "posted_at", None),
    )


async def scrape_company_jobs(
    company: dict[str, object],
    max_jobs: int,
) -> list[SearchResult]:
    ats_type = str(company.get("ats_type", ""))
    ats_slug = str(company.get("ats_slug", ""))
    company_name = str(company.get("name", ""))
    domain = str(company.get("domain", ""))

    if ats_type not in SEARCHABLE_ATS or not ats_slug:
        return []

    if domain:
        cached = get_cached_jobs(domain)
        if cached is not None:
            return cached[:max_jobs]

    registry = get_board_registry()
    try:
        response = await scrape_jobs(
            ats_type,  # type: ignore[arg-type]
            ScrapeRequest(ats_slug=ats_slug, company_id=domain or ats_slug),
        )
    except Exception as exc:
        logger.warning("Failed to scrape %s (%s): %s", company_name, ats_type, exc)
        if domain:
            deactivated = registry.record_board_failure(domain)
            if deactivated:
                logger.error(
                    "Deactivated board %s after repeated failures", domain
                )
        raise

    results = [
        canonical_to_search_result(
            job,
            company_name=company_name,
            ats_type=ats_type,
            ats_slug=ats_slug,
        )
        for job in response.jobs[:max_jobs]
    ]
    if domain:
        registry.record_board_success(domain)
        if results:
            set_cached_jobs(domain, results)
    return results
