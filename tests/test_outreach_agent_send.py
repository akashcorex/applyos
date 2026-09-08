from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_send_outreach_requires_service_token() -> None:
    from config import settings

    settings.agent_service_token = "test-token"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/outreach/send",
            json={
                "user_id": "user-1",
                "to_email": "hiring@example.com",
                "subject": "Hello",
                "body": "Following up",
            },
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_send_outreach_is_not_implemented() -> None:
    from config import settings

    settings.agent_service_token = "test-token"

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/outreach/send",
            headers={"X-Agent-Service-Token": "test-token"},
            json={
                "user_id": "user-1",
                "to_email": "hiring@example.com",
                "subject": "Hello",
                "body": "Following up",
            },
        )

    assert response.status_code == 501
    assert "not implemented" in response.json()["detail"]
