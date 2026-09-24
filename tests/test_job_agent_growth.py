from __future__ import annotations

from pathlib import Path

import pytest

from services import registry_growth as growth_module
from services.board_registry import BoardRegistry


@pytest.fixture
def growth_registry(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> BoardRegistry:
    seed_path = tmp_path / "seed.json"
    seed_path.write_text("[]", encoding="utf-8")
    registry = BoardRegistry(db_path=tmp_path / "grow.db", seed_path=seed_path)
    monkeypatch.setattr(growth_module, "get_board_registry", lambda: registry)
    return registry


async def _detect_ok(url: str):
    return "greenhouse", "acme", "high"


async def _detect_none(url: str):
    return None, None, "none"


async def _verify_jobs(ats_type: str, ats_slug: str) -> int:
    return 5


async def _verify_dry(ats_type: str, ats_slug: str) -> int:
    return 0


async def _verify_boom(ats_type: str, ats_slug: str) -> int:
    raise RuntimeError("ats down")


def _candidate(domain="newco.com", name="NewCo"):
    return {"name": name, "domain": domain}


@pytest.mark.asyncio
async def test_grow_activates_verified_board(growth_registry: BoardRegistry) -> None:
    results = await growth_module.grow_registry(
        [_candidate()], detect=_detect_ok, verify_fetch=_verify_jobs
    )
    assert len(results) == 1
    result = results[0]
    assert result.status == "active"
    assert result.jobs_found == 5
    assert result.written is True
    board = growth_registry.get_board_by_domain("newco.com")
    assert board is not None
    assert board["ats_type"] == "greenhouse"
    assert board["active"] is True


@pytest.mark.asyncio
async def test_grow_parks_dry_board(growth_registry: BoardRegistry) -> None:
    results = await growth_module.grow_registry(
        [_candidate()], detect=_detect_ok, verify_fetch=_verify_dry
    )
    assert results[0].status == "parked"
    board = growth_registry.get_board_by_domain("newco.com")
    assert board is not None
    assert board["active"] is False


@pytest.mark.asyncio
async def test_grow_parks_undetected_board(growth_registry: BoardRegistry) -> None:
    results = await growth_module.grow_registry(
        [_candidate()], detect=_detect_none, verify_fetch=_verify_jobs
    )
    assert results[0].status == "parked"
    assert results[0].ats_type is None
    board = growth_registry.get_board_by_domain("newco.com")
    assert board is not None
    assert board["active"] is False


@pytest.mark.asyncio
async def test_grow_skips_existing_and_duplicates(
    growth_registry: BoardRegistry,
) -> None:
    growth_registry.upsert_board(
        domain="old.com",
        company_name="Old",
        ats_type="lever",
        ats_slug="old",
        source="manual",
    )
    results = await growth_module.grow_registry(
        [
            _candidate("old.com", "Old"),
            _candidate(),
            _candidate("NEWCO.com", "NewCo Dup"),
        ],
        detect=_detect_ok,
        verify_fetch=_verify_jobs,
    )
    assert [r.status for r in results] == ["skipped", "active"]
    assert results[0].error == "already in registry"
    board = growth_registry.get_board_by_domain("old.com")
    assert board is not None
    assert board["ats_type"] == "lever"


@pytest.mark.asyncio
async def test_grow_failed_verify_writes_nothing(
    growth_registry: BoardRegistry,
) -> None:
    results = await growth_module.grow_registry(
        [_candidate()], detect=_detect_ok, verify_fetch=_verify_boom
    )
    assert results[0].status == "failed"
    assert "ats down" in (results[0].error or "")
    assert growth_registry.get_board_by_domain("newco.com") is None


@pytest.mark.asyncio
async def test_grow_dry_run_writes_nothing(growth_registry: BoardRegistry) -> None:
    results = await growth_module.grow_registry(
        [_candidate()], detect=_detect_ok, verify_fetch=_verify_jobs, dry_run=True
    )
    assert results[0].status == "active"
    assert results[0].written is False
    assert growth_registry.get_board_by_domain("newco.com") is None


@pytest.mark.asyncio
async def test_detect_career_board_writes_nothing(
    growth_registry: BoardRegistry,
) -> None:
    detected = await growth_module.detect_career_board(
        "newco.com", "NewCo", detect=_detect_ok
    )
    assert detected is not None
    assert detected["ats_slug"] == "acme"
    assert detected["career_url"] == "https://newco.com/careers"
    assert growth_registry.get_board_by_domain("newco.com") is None


@pytest.mark.asyncio
async def test_grow_route_counts(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from models import GrowthRequest
    from routes import registry as registry_route

    async def fake_grow(companies, **kwargs):
        from models import GrowthResult

        return [
            GrowthResult(domain="a.com", company_name="A", status="active"),
            GrowthResult(domain="b.com", company_name="B", status="parked"),
        ]

    monkeypatch.setattr(registry_route, "grow_registry", fake_grow)
    response = await registry_route.grow_registry_boards(
        GrowthRequest(companies=[{"name": "A", "domain": "a.com"}])
    )
    assert response.total == 2
    assert response.added_active == 1
    assert response.parked == 1
