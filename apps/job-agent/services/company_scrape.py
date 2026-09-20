"""Shared company-board scrape used by keyword and semantic search."""

from __future__ import annotations

import logging

from models import ScrapeRequest, SearchResult
from services.board_cache import get_cached_jobs, set_cached_jobs
from services.board_registry import get_board_registry
from services.ingest import PARSERS, scrape_jobs
from services.page_scrape import scrape_career_page

logger = logging.getLogger(__name__)

SEARCHABLE_ATS = frozenset(PARSERS.keys())

_FALLBACK_PATHS = ("/careers", "/jobs")
_MAX_FALLBACK_CANDIDATES = 3


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
) -> tuple[list[SearchResult], bool]:
    """Scrape one board; second tuple item is True when the career-page fallback served."""
    ats_type = str(company.get("ats_type", ""))
    ats_slug = str(company.get("ats_slug", ""))
    company_name = str(company.get("name", ""))
    domain = str(company.get("domain", ""))

    if ats_type not in SEARCHABLE_ATS or not ats_slug:
        return [], False

    if domain:
        cached = get_cached_jobs(domain)
        if cached is not None:
            items = cached[:max_jobs]
            via_fallback = bool(items) and all(
                job.ats_type == "generic" for job in items
            )
            return items, via_fallback

    registry = get_board_registry()
    ats_error: Exception | None = None
    try:
        response = await scrape_jobs(
            ats_type,  # type: ignore[arg-type]
            ScrapeRequest(ats_slug=ats_slug, company_id=domain or ats_slug),
        )
    except Exception as exc:
        logger.warning("Failed to scrape %s (%s): %s", company_name, ats_type, exc)
        ats_error = exc
        results: list[SearchResult] = []
    else:
        results = [
            canonical_to_search_result(
                job,
                company_name=company_name,
                ats_type=ats_type,
                ats_slug=ats_slug,
            )
            for job in response.jobs[:max_jobs]
        ]

    if results:
        if domain:
            registry.record_board_success(domain)
            set_cached_jobs(domain, results)
        return results, False

    fallback = await _try_career_fallback(company, max_jobs)
    if fallback:
        if domain:
            registry.record_board_success(domain)
            set_cached_jobs(domain, fallback)
        return fallback, True

    if ats_error is not None:
        if domain:
            deactivated = registry.record_board_failure(domain)
            if deactivated:
                logger.error(
                    "Deactivated board %s after repeated failures", domain
                )
        raise ats_error
    if domain:
        registry.record_board_success(domain)
    return [], False


def _career_candidates(company: dict[str, object]) -> list[str]:
    domain = str(company.get("domain", "")).strip().lower()
    stored = str(company.get("career_url", "") or "").strip()
    candidates = [stored] if stored else []
    if domain:
        candidates.extend(f"https://{domain}{path}" for path in _FALLBACK_PATHS)
    seen: list[str] = []
    for url in candidates:
        if url and url not in seen:
            seen.append(url)
    return seen[:_MAX_FALLBACK_CANDIDATES]


async def _try_career_fallback(
    company: dict[str, object],
    max_jobs: int,
) -> list[SearchResult]:
    domain = str(company.get("domain", ""))
    company_name = str(company.get("name", "")) or None
    for url in _career_candidates(company):
        try:
            jobs = await scrape_career_page(url, company_name=company_name)
        except Exception as exc:
            logger.warning("Career fallback failed for %s: %s", url, exc)
            continue
        if jobs:
            logger.info(
                "Career fallback served %d jobs for %s via %s",
                len(jobs),
                domain,
                url,
            )
            return jobs[:max_jobs]
    return []
