from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.fixture
def registry_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    db_path = tmp_path / "registry_route.db"
    monkeypatch.setattr("config.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("services.board_registry.settings.registry_db_path", str(db_path))
    monkeypatch.setattr("services.board_registry._registry", None)
    return db_path


@pytest.mark.asyncio
async def test_list_registry_boards(registry_db: Path) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/registry")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] >= 37
    assert any(board["domain"] == "stripe.com" for board in body["boards"])


@pytest.mark.asyncio
async def test_upsert_registry_board(registry_db: Path) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/registry",
            json={
                "domain": "example.com",
                "company_name": "Example Co",
                "ats_type": "greenhouse",
                "ats_slug": "example",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["domain"] == "example.com"
    assert body["ats_slug"] == "example"


@pytest.mark.asyncio
async def test_registry_from_detect_upserts_board(registry_db: Path) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/registry/from-detect",
            json={
                "career_page_url": "https://boards.greenhouse.io/acme",
                "company_name": "Acme",
            },
        )
    assert response.status_code == 200
    body = response.json()
    assert body["detect"]["ats_type"] == "greenhouse"
    assert body["detect"]["suggested_slug"] == "acme"
    assert body["board"]["domain"] == "acme.careers"
    assert body["board"]["ats_slug"] == "acme"
