"""Scheduled refresh sweeps (R4).

Each sweep scrapes the next rotation window through the standard
scrape path, so caches stay warm and first_seen stamps stay fresh
without any user searching. Scoring stays query-time: no embeddings here.
"""

from __future__ import annotations

import asyncio
import logging
import time

from config import settings
from services.board_registry import get_board_registry
from services.company_scrape import scrape_company_jobs
from services.search_inventory import get_searchable_companies

logger = logging.getLogger(__name__)

_refresh_running = False


async def sweep_once(batch_size: int | None = None) -> dict[str, int]:
    """Scrape one rotation window; per-board failures never fail the sweep."""
    batch = batch_size if batch_size is not None else settings.refresh_batch_boards
    registry = get_board_registry()
    companies = get_searchable_companies(max(1, batch))
    boards = jobs = errors = 0
    started = time.perf_counter()
    for company in companies:
        try:
            result = await scrape_company_jobs(company, settings.refresh_sweep_jobs)
        except Exception as exc:
            errors += 1
            logger.warning(
                "Refresh sweep skipped %s: %s", company.get("domain"), exc
            )
            continue
        boards += 1
        jobs += len(result.jobs)
    stats = {
        "boards": boards,
        "jobs": jobs,
        "errors": errors,
        "duration_ms": int((time.perf_counter() - started) * 1000),
    }
    registry.set_meta_value("refresh_last_at", str(int(time.time())))
    registry.set_meta_value("refresh_last_boards", str(boards))
    registry.set_meta_value("refresh_last_jobs", str(jobs))
    registry.set_meta_value("refresh_last_errors", str(errors))
    logger.info(
        "Refresh sweep done: %d boards, %d jobs, %d errors in %dms",
        boards,
        jobs,
        errors,
        stats["duration_ms"],
    )
    return stats


async def refresh_loop() -> None:
    """Lifespan task: sweep every interval, never overlapping itself."""
    global _refresh_running
    await asyncio.sleep(settings.refresh_interval_seconds)
    while True:
        if _refresh_running:
            logger.warning("Refresh sweep still running; skipping tick")
        else:
            _refresh_running = True
            try:
                await sweep_once()
            except Exception as exc:
                logger.error("Refresh sweep failed: %s", exc)
            finally:
                _refresh_running = False
        await asyncio.sleep(settings.refresh_interval_seconds)
