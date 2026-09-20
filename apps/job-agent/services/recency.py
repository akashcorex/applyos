"""Job age, newest-first ordering, and stale filtering (R1).

posted_at semantics differ per ATS (and are missing for generic boards),
so age is best-effort: known dates drive ordering and stale filtering,
unknown dates are never penalized.
"""

from __future__ import annotations

from datetime import datetime, timezone

from models import SearchResult

_SECONDS_PER_DAY = 86400


def job_age_days(
    posted_at: str | None, *, now: datetime | None = None
) -> int | None:
    """Age in whole days from an ISO posted_at, or None when unknown."""
    if not posted_at:
        return None
    try:
        posted = datetime.fromisoformat(posted_at.strip())
    except (ValueError, AttributeError):
        return None
    if posted.tzinfo is None:
        posted = posted.replace(tzinfo=timezone.utc)
    moment = now or datetime.now(timezone.utc)
    age = (moment - posted).total_seconds() / _SECONDS_PER_DAY
    return max(0, int(age))


def sort_newest_first(jobs: list[SearchResult]) -> list[SearchResult]:
    """Newest posted_at first; unknown dates keep relative order at the end."""
    dated = [job for job in jobs if job.posted_at]
    undated = [job for job in jobs if not job.posted_at]
    dated.sort(key=lambda job: str(job.posted_at), reverse=True)
    return [*dated, *undated]


def filter_stale_jobs(
    jobs: list[SearchResult],
    max_age_days: int,
    *,
    now: datetime | None = None,
) -> tuple[list[SearchResult], int]:
    """Drop jobs with a known age past the limit; unknown ages are kept."""
    fresh: list[SearchResult] = []
    dropped = 0
    for job in jobs:
        age = job_age_days(job.posted_at, now=now)
        if age is not None and age > max_age_days:
            dropped += 1
            continue
        fresh.append(job)
    return fresh, dropped
