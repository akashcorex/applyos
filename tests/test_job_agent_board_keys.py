from pathlib import Path

import pytest

from models import SearchResult
from services.board_cache import get_cached_job_keys, set_cached_jobs


@pytest.fixture
def cache_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "board_keys.db"
    monkeypatch.setattr("services.board_cache.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("config.settings.registry_db_path", str(db_path))
    return db_path


def _job(dedup_key: str) -> SearchResult:
    return SearchResult(
        external_id=dedup_key,
        source="greenhouse",
        title="Engineer",
        company_name="Acme",
        dedup_key=dedup_key,
        ats_type="greenhouse",
        ats_slug="acme",
    )


def test_board_keys_roundtrip(cache_db: Path) -> None:
    set_cached_jobs("Acme.COM", [_job("a::1"), _job("a::2")])
    cached = get_cached_job_keys("acme.com")
    assert cached is not None
    keys, scraped_at = cached
    assert keys == ["a::1", "a::2"]
    assert scraped_at


def test_board_keys_missing_domain(cache_db: Path) -> None:
    assert get_cached_job_keys("unknown.example") is None
