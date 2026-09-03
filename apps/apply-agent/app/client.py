"""HTTP client for persisting LinkedIn connect results via apps/api."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


async def report_linkedin_connects(connects: list[dict[str, Any]]) -> None:
    """POST bulk upsert to ``/v1/linkedin-connects/bulk``.

    Failures are logged but do not raise — connect side-effects should not
    crash the worker solely because persistence failed.
    """
    if not connects:
        return

    url = f"{settings.api_url.rstrip('/')}/v1/linkedin-connects/bulk"
    try:
        headers: dict[str, str] = {}
        if settings.agent_service_token:
            headers["X-Agent-Service-Token"] = settings.agent_service_token
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url, json={"connects": connects}, headers=headers
            )
            response.raise_for_status()
            logger.info(
                "Reported %d linkedin connects to API (status=%s)",
                len(connects),
                response.status_code,
            )
    except Exception as exc:
        logger.error("Failed to report linkedin connects to API: %s", exc)
