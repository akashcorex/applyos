import json
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from main import app

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.asyncio
async def test_ingest_greenhouse_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    fixture = json.loads((FIXTURES / "greenhouse_sample.json").read_text())

    async def fake_fetch(_url: str) -> object:
        return fixture

    monkeypatch.setattr(
        "services.parsers.greenhouse.fetch_json_with_retries",
        fake_fetch,
    )

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/ingest/greenhouse",
            json={"ats_slug": "stripe"},
        )

    assert response.status_code == 200
    body = response.json()
    assert body["ats_type"] == "greenhouse"
    assert body["jobs_found"] == 2
    assert body["jobs"][0]["title_normalized"] == "senior software engineer - platform"
