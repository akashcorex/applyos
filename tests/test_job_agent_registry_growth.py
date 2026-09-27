from pathlib import Path

import pytest

from services.registry_growth import probe_career_board


@pytest.fixture
def growth_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "growth.db"
    monkeypatch.setattr("config.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("services.board_registry.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("services.board_registry._registry", None)
    return db_path


@pytest.mark.asyncio
async def test_probe_career_board_upserts_detected_board(
    growth_db: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_detect(url: str):
        assert url.endswith("/careers")
        return "greenhouse", "newco", "high"

    monkeypatch.setattr("services.registry_growth.detect_ats", fake_detect)
    board = await probe_career_board("newco.com", "NewCo")
    assert board is not None
    assert board["ats_type"] == "greenhouse"
    assert board["ats_slug"] == "newco"


@pytest.mark.asyncio
async def test_probe_career_board_skips_existing_board(
    growth_db: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from services.board_registry import get_board_registry

    get_board_registry().upsert_board(
        domain="existing.com",
        company_name="Existing",
        ats_type="lever",
        ats_slug="existing",
        source="manual",
    )

    async def fail_detect(_url: str):
        raise AssertionError("detect should not run for mapped boards")

    monkeypatch.setattr("services.registry_growth.detect_ats", fail_detect)
    board = await probe_career_board("existing.com", "Existing")
    assert board is not None
    assert board["ats_type"] == "lever"
