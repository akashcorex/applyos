"""Read-only audit of ATS boards.

Probes each board's public ATS endpoint (via an injectable fetcher so tests
stay hermetic) and classifies it as ok / empty / error / skipped. Never
writes to the registry, the board cache, or any failure counters.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable, Sequence
from typing import Any

from models import BoardAttempt, ScrapeRequest
from services.ingest import scrape_jobs
from services.parsers.ashby import ASHBY_JOBS_URL
from services.parsers.breezy import BREEZY_JOBS_URL
from services.parsers.feeds import FEED_URLS
from services.parsers.greenhouse import GREENHOUSE_JOBS_URL
from services.parsers.lever import LEVER_JOBS_URL
from services.parsers.personio import PERSONIO_JOBS_URL
from services.parsers.recruitee import RECRUITEE_JOBS_URL
from services.parsers.rippling import RIPPLING_JOBS_URL
from services.parsers.teamtailor import TEAMTAILOR_JOBS_URL
from services.parsers.wellfound import WELLFOUND_COMPANY_JOBS_URL
from services.parsers.workable import WORKABLE_JOBS_URL

_PROBE_TEMPLATES = {
    "greenhouse": GREENHOUSE_JOBS_URL,
    "lever": LEVER_JOBS_URL,
    "ashby": ASHBY_JOBS_URL,
    "personio": PERSONIO_JOBS_URL,
    "recruitee": RECRUITEE_JOBS_URL,
    "workable": WORKABLE_JOBS_URL,
    "wellfound": WELLFOUND_COMPANY_JOBS_URL,
    "teamtailor": TEAMTAILOR_JOBS_URL,
    "breezy": BREEZY_JOBS_URL,
    "rippling": RIPPLING_JOBS_URL,
}

_ERROR_PREVIEW_CHARS = 200
_SAMPLE_TITLES = 3
_DEFAULT_CONCURRENCY = 8


def probe_url_for(ats_type: str, ats_slug: str) -> str | None:
    """Return the public ATS URL probed for a board, if the ATS is known."""
    normalized = (ats_type or "").strip().lower()
    if normalized == "feed":
        return FEED_URLS.get((ats_slug or "").strip().lower())
    template = _PROBE_TEMPLATES.get(normalized)
    if template is None or not (ats_slug or "").strip():
        return None
    try:
        return template.format(slug=ats_slug.strip(), page=0)
    except (IndexError, KeyError):
        return None


async def _default_fetch(company: dict[str, object]) -> Sequence[Any]:
    from services.ingest import scrape_feed_jobs

    ats_type = str(company.get("ats_type", ""))
    if ats_type == "feed":
        return await scrape_feed_jobs(str(company.get("ats_slug", "")))
    response = await scrape_jobs(
        ats_type,
        ScrapeRequest(
            ats_slug=str(company.get("ats_slug", "")),
            company_id=str(
                company.get("domain", "") or company.get("ats_slug", "")
            ),
        ),
    )
    return response.jobs


FetchJobs = Callable[[dict[str, object]], Awaitable[Sequence[Any]]]


def _company_text(company: dict[str, object], key: str) -> str:
    return str(company.get(key, "") or "")


async def _audit_one(
    company: dict[str, object],
    fetch: FetchJobs,
    semaphore: asyncio.Semaphore,
    sample_titles: int,
) -> BoardAttempt:
    domain = _company_text(company, "domain")
    name = _company_text(company, "name")
    ats_type = _company_text(company, "ats_type")
    ats_slug = _company_text(company, "ats_slug")
    probe_url = probe_url_for(ats_type, ats_slug)
    if probe_url is None:
        return BoardAttempt(
            domain=domain,
            company_name=name,
            ats_type=ats_type,
            ats_slug=ats_slug,
            probe_url=None,
            status="skipped",
            error="unknown ATS type or missing slug",
        )
    started = time.perf_counter()
    async with semaphore:
        try:
            jobs = await fetch(company)
        except Exception as exc:
            return BoardAttempt(
                domain=domain,
                company_name=name,
                ats_type=ats_type,
                ats_slug=ats_slug,
                probe_url=probe_url,
                status="error",
                error=str(exc)[:_ERROR_PREVIEW_CHARS],
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
    latency_ms = int((time.perf_counter() - started) * 1000)
    items = list(jobs)
    if not items:
        return BoardAttempt(
            domain=domain,
            company_name=name,
            ats_type=ats_type,
            ats_slug=ats_slug,
            probe_url=probe_url,
            status="empty",
            latency_ms=latency_ms,
        )
    titles = [str(getattr(job, "title", "")) for job in items[:sample_titles]]
    return BoardAttempt(
        domain=domain,
        company_name=name,
        ats_type=ats_type,
        ats_slug=ats_slug,
        probe_url=probe_url,
        status="ok",
        jobs_found=len(items),
        sample_titles=[title for title in titles if title],
        latency_ms=latency_ms,
    )


async def audit_boards(
    companies: Sequence[dict[str, object]],
    fetch: FetchJobs | None = None,
    concurrency: int = _DEFAULT_CONCURRENCY,
    sample_titles: int = _SAMPLE_TITLES,
) -> list[BoardAttempt]:
    """Audit boards in input order with bounded concurrency."""
    semaphore = asyncio.Semaphore(max(1, concurrency))
    fetch_fn = fetch or _default_fetch
    tasks = [
        _audit_one(company, fetch_fn, semaphore, sample_titles)
        for company in companies
    ]
    return list(await asyncio.gather(*tasks))


def summarize_attempts(attempts: Sequence[BoardAttempt]) -> dict[str, Any]:
    """Aggregate audit attempts into status/ATS counts plus failing domains."""
    by_status: dict[str, int] = {}
    by_ats: dict[str, int] = {}
    failing: list[str] = []
    jobs_total = 0
    for attempt in attempts:
        by_status[attempt.status] = by_status.get(attempt.status, 0) + 1
        by_ats[attempt.ats_type or "unknown"] = (
            by_ats.get(attempt.ats_type or "unknown", 0) + 1
        )
        jobs_total += attempt.jobs_found
        if attempt.status in ("empty", "error"):
            failing.append(attempt.domain)
    return {
        "total": len(attempts),
        "by_status": by_status,
        "by_ats": by_ats,
        "jobs_total": jobs_total,
        "failing_domains": sorted(failing),
    }
