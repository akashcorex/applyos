from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from main import app


@pytest.mark.asyncio
async def test_send_outreach_requires_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    import services.email_sender as email_sender
    from config import settings

    monkeypatch.setattr(settings, "agent_service_token", "test-token")
    monkeypatch.setattr(email_sender, "user_email_outreach_enabled", AsyncMock(return_value=True))
    monkeypatch.setattr(email_sender, "configured_provider", lambda: "resend")

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
async def test_send_outreach_requires_user_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    import services.email_sender as email_sender
    from config import settings

    monkeypatch.setattr(settings, "agent_service_token", "test-token")
    monkeypatch.setattr(email_sender, "user_email_outreach_enabled", AsyncMock(return_value=False))
    monkeypatch.setattr(email_sender, "configured_provider", lambda: "resend")

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

    assert response.status_code == 403
    assert "enables" in response.json()["detail"]
