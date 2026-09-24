"""Grow the board registry from external company lists.

Pipeline per company: dedupe → detect ATS from career pages → verify the
board serves jobs → upsert. Boards are parked inactive until verification
succeeds; the Phase 2 re-probe and Phase 3 fallback can serve them later.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from typing import Any, Literal

from models import GrowthResult, ScrapeRequest
from services.ats_detect import detect_ats
from services.board_registry import get_board_registry
from services.ingest import scrape_jobs

logger = logging.getLogger(__name__)

CAREER_PATHS = ("/careers", "/jobs", "/about/careers", "/company/careers")

_DEFAULT_CONCURRENCY = 4
_ERROR_PREVIEW_CHARS = 200

GrowthSource = Literal["yc", "detect"]

DetectedBoard = dict[str, object]
DetectFn = Callable[[str], Awaitable[tuple[Any, Any, str]]]
VerifyFn = Callable[[str, str], Awaitable[int]]


async def detect_career_board(
    domain: str,
    company_name: str,
    detect: DetectFn | None = None,
) -> DetectedBoard | None:
    """Detect a board from career pages without writing to the registry."""
    detect_fn = detect or detect_ats
    for path in CAREER_PATHS:
        career_url = f"https://{domain}{path}"
        try:
            ats_type, slug, confidence = await detect_fn(career_url)
        except ValueError:
            raise
        except Exception as exc:
            logger.warning("ATS detect fetch failed for %s: %s", career_url, exc)
            continue
        if not ats_type or not slug or confidence == "none":
            continue
        return {
            "domain": domain,
            "company_name": company_name,
            "ats_type": ats_type,
            "ats_slug": slug,
            "career_url": career_url,
        }
    return None


async def probe_career_board(
    domain: str,
    company_name: str,
) -> dict[str, object] | None:
    registry = get_board_registry()
    existing = registry.get_board_by_domain(domain)
    if existing and existing.get("ats_type") and existing.get("ats_slug"):
        return existing

    detected = await detect_career_board(domain, company_name)
    if detected is None:
        return None
    return registry.upsert_board(
        domain=str(detected["domain"]),
        company_name=str(detected["company_name"]),
        ats_type=str(detected["ats_type"]),
        ats_slug=str(detected["ats_slug"]),
        career_url=str(detected["career_url"]),
        source="yc",
    )


async def _default_verify(ats_type: str, ats_slug: str) -> int:
    response = await scrape_jobs(
        ats_type,  # type: ignore[arg-type]
        ScrapeRequest(ats_slug=ats_slug, company_id=ats_slug),
    )
    return response.jobs_found


def _normalize_candidate(company: dict[str, object]) -> tuple[str, str] | None:
    domain = str(company.get("domain", "")).strip().lower()
    name = str(company.get("name", "") or domain).strip()
    if not domain or not name:
        return None
    return name, domain


async def _grow_one(
    name: str,
    domain: str,
    source: GrowthSource,
    verify: bool,
    dry_run: bool,
    semaphore: asyncio.Semaphore,
    detect: DetectFn | None,
    verify_fetch: VerifyFn | None,
) -> GrowthResult:
    registry = get_board_registry()
    existing = registry.get_board_by_domain(domain)
    if existing:
        return GrowthResult(
            domain=domain,
            company_name=name,
            status="skipped",
            error="already in registry",
        )
    verify_fn = verify_fetch or _default_verify
    async with semaphore:
        try:
            detected = await detect_career_board(domain, name, detect=detect)
        except Exception as exc:
            return GrowthResult(
                domain=domain,
                company_name=name,
                status="failed",
                error=str(exc)[:_ERROR_PREVIEW_CHARS],
            )
        jobs_found = 0
        if detected is not None and verify:
            try:
                jobs_found = await verify_fn(
                    str(detected["ats_type"]), str(detected["ats_slug"])
                )
            except Exception as exc:
                return GrowthResult(
                    domain=domain,
                    company_name=name,
                    ats_type=str(detected["ats_type"]),
                    ats_slug=str(detected["ats_slug"]),
                    career_url=str(detected["career_url"]),
                    status="failed",
                    error=str(exc)[:_ERROR_PREVIEW_CHARS],
                )
    active = detected is not None and (not verify or jobs_found > 0)
    status = "active" if active else "parked"
    if not dry_run:
        registry.upsert_board(
            domain=domain,
            company_name=name,
            ats_type=str(detected["ats_type"]) if detected else "",
            ats_slug=str(detected["ats_slug"]) if detected else "",
            career_url=str(detected["career_url"]) if detected else None,
            source=source,
            active=active,
        )
    return GrowthResult(
        domain=domain,
        company_name=name,
        ats_type=str(detected["ats_type"]) if detected else None,
        ats_slug=str(detected["ats_slug"]) if detected else None,
        career_url=str(detected["career_url"]) if detected else None,
        status=status,
        jobs_found=jobs_found,
        written=not dry_run,
    )


async def grow_registry(
    companies: list[dict[str, object]],
    *,
    source: GrowthSource = "yc",
    verify: bool = True,
    dry_run: bool = False,
    concurrency: int = _DEFAULT_CONCURRENCY,
    detect: DetectFn | None = None,
    verify_fetch: VerifyFn | None = None,
) -> list[GrowthResult]:
    """Dedupe, detect, verify, and upsert candidate companies in order."""
    seen: set[str] = set()
    queue: list[tuple[str, str]] = []
    for company in companies:
        normalized = _normalize_candidate(company)
        if normalized is None:
            continue
        name, domain = normalized
        if domain in seen:
            continue
        seen.add(domain)
        queue.append((name, domain))
    semaphore = asyncio.Semaphore(max(1, concurrency))
    tasks = [
        _grow_one(
            name, domain, source, verify, dry_run, semaphore, detect, verify_fetch
        )
        for name, domain in queue
    ]
    return list(await asyncio.gather(*tasks))
