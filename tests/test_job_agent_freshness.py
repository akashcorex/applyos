from pathlib import Path

import pytest

from models import SearchResult
from services.freshness import apply_freshness_metadata, sort_by_freshness
from services.job_snapshots import record_job_seen


@pytest.fixture
def snapshot_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "freshness.db"
    monkeypatch.setattr("services.job_snapshots.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("config.settings.registry_db_path", str(db_path))
    return db_path


def _job(dedup_key: str, posted_at: str | None) -> SearchResult:
    return SearchResult(
        external_id=dedup_key,
        source="greenhouse",
        title="Engineer",
        company_name="Acme",
        dedup_key=dedup_key,
        ats_type="greenhouse",
        ats_slug="acme",
        posted_at=posted_at,
    )


def test_sort_by_freshness_orders_newest_first() -> None:
    jobs = [
        _job("old", "2026-03-01T00:00:00+00:00"),
        _job("new", "2026-03-10T00:00:00+00:00"),
    ]
    sorted_jobs = sort_by_freshness(jobs)
    assert [job.dedup_key for job in sorted_jobs] == ["new", "old"]


def test_apply_freshness_metadata_uses_first_seen_when_posted_missing(
    snapshot_db: Path,
) -> None:
    job = _job("missing-date", None)
    enriched = apply_freshness_metadata([job])
    assert enriched[0].posted_at is not None
    assert record_job_seen("missing-date", None) == enriched[0].posted_at
