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

    async def linkedin_session_status(self, user_id: str) -> dict[str, Any]:
        url = f"{self._base_url}/admin/linkedin/session/{user_id}"
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()

    async def trigger_discover_connect(
        self,
        *,
        user_id: str,
        job_id: str,
        company_name: str,
        job_title: str | None = None,
        delay_seconds: int | None = None,
    ) -> dict[str, Any]:
        """Fire-and-forget enqueue of post-apply LinkedIn employee connects."""
        url = f"{self._base_url}/admin/trigger/discover-connect"
        body: dict[str, Any] = {
            "user_id": user_id,
            "job_id": job_id,
            "company_name": company_name,
            "job_title": job_title,
        }
        if delay_seconds is not None:
            body["delay_seconds"] = delay_seconds
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(url, json=body)
            response.raise_for_status()
            data = response.json()
        logger.info(
            "Triggered discover-connect task_id=%s job_id=%s company=%s",
            data.get("task_id"),
            job_id,
            company_name,
        )
        return data

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
