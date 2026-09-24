from __future__ import annotations

from datetime import datetime, timedelta, timezone

from models import SearchResult
from services.recency import (
    filter_stale_jobs,
    job_age_days,
    recency_score,
    sort_newest_first,
)


def _job(key: str, posted_at: str | None) -> SearchResult:
    return SearchResult(
        external_id=key,
        source="greenhouse",
        title="Engineer",
        company_name="Acme",
        dedup_key=key,
        ats_type="greenhouse",
        ats_slug="acme",
        posted_at=posted_at,
    )


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


def test_job_age_days_counts_whole_days() -> None:
    assert job_age_days(_iso(3)) == 3
    assert job_age_days(None) is None
    assert job_age_days("") is None
    assert job_age_days("not-a-date") is None


def test_job_age_days_clamps_future_to_zero() -> None:
    future = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    assert job_age_days(future) == 0


def test_sort_newest_first_keeps_unknown_dates_last_in_order() -> None:
    jobs = [_job("u1", None), _job("old", _iso(30)), _job("new", _iso(1)), _job("u2", None)]
    assert [job.dedup_key for job in sort_newest_first(jobs)] == [
        "new",
        "old",
        "u1",
        "u2",
    ]


def test_filter_stale_jobs_drops_only_known_old() -> None:
    jobs = [_job("old", _iso(400)), _job("fresh", _iso(10)), _job("unknown", None)]
    fresh, dropped = filter_stale_jobs(jobs, 120)
    assert [job.dedup_key for job in fresh] == ["fresh", "unknown"]
    assert dropped == 1


def test_recency_score_decays_linearly() -> None:
    assert recency_score(_iso(0), 120) == 1.0
    assert recency_score(_iso(60), 120) == 0.5
    assert recency_score(_iso(120), 120) == 0.0
    assert recency_score(_iso(400), 120) == 0.0
    assert recency_score(None, 120) == 0.5
