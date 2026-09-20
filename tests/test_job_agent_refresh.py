from __future__ import annotations

import pytest

from services import refresh as refresh_module


@pytest.mark.asyncio
async def test_sweep_scrapes_window_and_records_stats(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.company_scrape import CompanyScrapeResult
    from services.board_registry import BoardRegistry
    from pathlib import Path
    import tempfile

    db_path = str(Path(tempfile.mkdtemp()) / "refresh.db")
    registry = BoardRegistry(db_path=Path(db_path))
    monkeypatch.setattr(refresh_module, "get_board_registry", lambda: registry)
    monkeypatch.setattr(
        refresh_module,
        "get_searchable_companies",
        lambda limit: [
            {"name": "A", "domain": "a.com"},
            {"name": "B", "domain": "b.com"},
        ][:limit],
    )

    async def fake_scrape(company, max_jobs):
        from models import SearchResult

        if company["domain"] == "b.com":
            raise RuntimeError("ats down")
        return CompanyScrapeResult(
            jobs=[
                SearchResult(
                    external_id="1",
                    source="greenhouse",
                    title="Engineer",
                    company_name="A",
                    dedup_key="a::engineer",
                    ats_type="greenhouse",
                    ats_slug="a",
                )
            ]
        )

    monkeypatch.setattr(refresh_module, "scrape_company_jobs", fake_scrape)
    stats = await refresh_module.sweep_once(batch_size=2)
    assert stats == {
        "boards": 1,
        "jobs": 1,
        "errors": 1,
        "duration_ms": stats["duration_ms"],
    }
    assert registry.get_meta_value("refresh_last_boards") == "1"
    assert registry.get_meta_value("refresh_last_errors") == "1"


@pytest.mark.asyncio
async def test_sweep_failure_does_not_raise(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        refresh_module, "get_searchable_companies", lambda limit: []
    )
    stats = await refresh_module.sweep_once(batch_size=4)
    assert stats["boards"] == 0
    assert stats["errors"] == 0


@pytest.mark.asyncio
async def test_refresh_status_route(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from routes import registry as registry_route

    class _FakeRegistry:
        def get_meta_value(self, key: str):
            return {"refresh_last_at": "123"} .get(key)

    monkeypatch.setattr(registry_route, "get_board_registry", lambda: _FakeRegistry())
    monkeypatch.setattr("config.settings.refresh_enabled", False)
    body = await registry_route.refresh_status()
    assert body["last_at"] == "123"
    assert body["enabled"] is False
