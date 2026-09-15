from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from models import SearchResult
from services.board_cache import get_cached_jobs, set_cached_jobs


def _job() -> SearchResult:
    return SearchResult(
        external_id="1",
        source="greenhouse",
        title="Engineer",
        company_name="Acme",
        dedup_key="acme::engineer",
        ats_type="greenhouse",
        ats_slug="acme",
    )


@pytest.fixture
def cache_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "cache.db"
    monkeypatch.setattr("config.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("services.board_cache.settings.registry_db_path", str(db_path))
    return db_path


def test_set_and_get_cached_jobs(cache_db: Path) -> None:
    set_cached_jobs("acme.com", [_job()])
    cached = get_cached_jobs("acme.com")
    assert cached is not None
    assert len(cached) == 1
    assert cached[0].title == "Engineer"


def test_cache_expires(cache_db: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("config.settings.board_cache_ttl_seconds", 1)
    monkeypatch.setattr("services.board_cache.settings.board_cache_ttl_seconds", 1)
    set_cached_jobs("acme.com", [_job()])

    import sqlite3

    stale = (datetime.now(timezone.utc) - timedelta(seconds=10)).isoformat()
    with sqlite3.connect(cache_db) as conn:
        conn.execute(
            "UPDATE board_job_cache SET scraped_at = ? WHERE domain = ?",
            (stale, "acme.com"),
        )

    assert get_cached_jobs("acme.com") is None
