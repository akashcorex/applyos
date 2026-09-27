"""Shared company-board scrape used by keyword and semantic search."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from config import settings
from models import ScrapeRequest, SearchResult
from services.board_cache import get_cached_jobs, set_cached_jobs
from services.board_registry import get_board_registry
from services.ingest import PARSERS, scrape_jobs
from services.job_snapshots import record_job_seen
from services.page_scrape import scrape_career_page
from services.recency import filter_stale_jobs, sort_newest_first, trust_flags

logger = logging.getLogger(__name__)

SEARCHABLE_ATS = frozenset(PARSERS.keys())

_FALLBACK_PATHS = ("/careers", "/jobs")
_MAX_FALLBACK_CANDIDATES = 3


@dataclass
class CompanyScrapeResult:
    jobs: list[SearchResult] = field(default_factory=list)
    via_fallback: bool = False
    dropped_stale: int = 0


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
        salary_min=getattr(job, "salary_min", None),
        salary_max=getattr(job, "salary_max", None),
        salary_currency=getattr(job, "salary_currency", None),
    )


def _finalize_jobs(
    jobs: list[SearchResult],
    max_jobs: int,
    *,
    via_fallback: bool,
) -> CompanyScrapeResult:
    """Stamp first-seen, flag trust signals, drop known-stale, keep newest."""
    for job in jobs:
        try:
            first_seen = record_job_seen(job.dedup_key, job.posted_at)
        except Exception as exc:
            logger.warning("first_seen stamp failed for %s: %s", job.dedup_key, exc)
            first_seen = None
        job.flags = trust_flags(
            job.description, first_seen, settings.trust_evergreen_days
        )
    fresh, dropped = filter_stale_jobs(jobs, settings.job_max_age_days)
    if dropped:
        logger.info("Dropped %d stale jobs past %d days", dropped, settings.job_max_age_days)
    return CompanyScrapeResult(
        jobs=sort_newest_first(fresh)[:max_jobs],
        via_fallback=via_fallback,
        dropped_stale=dropped,
    )


async def scrape_company_jobs(
    company: dict[str, object],
    max_jobs: int,
) -> CompanyScrapeResult:
    """Scrape one board; newest jobs win truncation and known-stale ones drop."""
    ats_type = str(company.get("ats_type", ""))
    ats_slug = str(company.get("ats_slug", ""))
    company_name = str(company.get("name", ""))
    domain = str(company.get("domain", ""))

    if ats_type not in SEARCHABLE_ATS or not ats_slug:
        return CompanyScrapeResult()

    if domain:
        cached = get_cached_jobs(domain)
        if cached is not None:
            items = cached[:max_jobs]
            via_fallback = bool(items) and all(
                job.ats_type == "generic" for job in items
            )
            return CompanyScrapeResult(jobs=items, via_fallback=via_fallback)

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
            for job in response.jobs
        ]

    if results:
        finalized = _finalize_jobs(results, max_jobs, via_fallback=False)
        if finalized.jobs:
            if domain:
                registry.record_board_success(domain)
                set_cached_jobs(domain, finalized.jobs)
            return finalized

    fallback = await _try_career_fallback(company, max_jobs)
    if fallback:
        finalized = _finalize_jobs(fallback, max_jobs, via_fallback=True)
        if domain:
            registry.record_board_success(domain)
            if ats_error is None:
                set_cached_jobs(domain, finalized.jobs)
        return finalized

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
    return CompanyScrapeResult()


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
