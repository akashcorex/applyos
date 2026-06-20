"""HTTP client for apply-agent admin endpoints."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings
from models import JobPayload, TriggerApplyResponse

logger = logging.getLogger(__name__)


class ApplyAgentClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.apply_agent_url).rstrip("/")

    async def trigger_apply(self, payload: JobPayload) -> TriggerApplyResponse:
        url = f"{self._base_url}/admin/trigger/apply"
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(
                url,
                json=payload.model_dump(mode="json"),
            )
            response.raise_for_status()
            data = response.json()

        return TriggerApplyResponse.model_validate(data)

    async def worker_status(self) -> dict[str, Any]:
        url = f"{self._base_url}/admin/status/workers"
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self._base_url}/health")
                return response.status_code == 200
        except httpx.HTTPError:
            return False
