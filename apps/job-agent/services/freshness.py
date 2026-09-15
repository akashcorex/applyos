"""Freshness ranking for search results."""

from __future__ import annotations

from models import SearchResult
from services.job_snapshots import record_job_seen


def apply_freshness_metadata(jobs: list[SearchResult]) -> list[SearchResult]:
    enriched: list[SearchResult] = []
    for job in jobs:
        first_seen = record_job_seen(job.dedup_key, job.posted_at)
        if job.posted_at is None and first_seen:
            enriched.append(job.model_copy(update={"posted_at": first_seen}))
        else:
            enriched.append(job)
    return enriched


def sort_by_freshness(jobs: list[SearchResult]) -> list[SearchResult]:
    return sorted(
        jobs,
        key=lambda job: job.posted_at or "",
        reverse=True,
    )
