"""HTTP client for syncing application session state to apps/api."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class ApplicationApiClient:
    """Persists HITL session state to the durable applications API."""

    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.api_url).rstrip("/")

    def _headers(self) -> dict[str, str]:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if settings.agent_service_token:
            headers["X-Agent-Service-Token"] = settings.agent_service_token
        return headers

    async def update_session(
        self,
        application_id: str,
        *,
        status: str | None = None,
        browser_session_id: str | None = None,
        current_url: str | None = None,
        current_step: str | None = None,
        control_mode: str | None = None,
        human_intervention_required: bool | None = None,
        intervention_reason: str | None = None,
    ) -> None:
        body: dict[str, Any] = {}
        if status is not None:
            body["status"] = status
        if browser_session_id is not None:
            body["browserSessionId"] = browser_session_id
        if current_url is not None:
            body["currentUrl"] = current_url
        if current_step is not None:
            body["currentStep"] = current_step
        if control_mode is not None:
            body["controlMode"] = control_mode
        if human_intervention_required is not None:
            body["humanInterventionRequired"] = human_intervention_required
        if intervention_reason is not None:
            body["interventionReason"] = intervention_reason

        if not body:
            return

        url = f"{self._base_url}/v1/applications/internal/{application_id}/session"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.patch(url, json=body, headers=self._headers())
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning(
                "Failed to update application session application_id=%s: %s",
                application_id,
                exc,
            )

    async def create_intervention(
        self,
        application_id: str,
        *,
        intervention_type: str,
        message: str,
    ) -> None:
        url = f"{self._base_url}/v1/applications/internal/{application_id}/interventions"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    url,
                    json={"type": intervention_type, "message": message},
                    headers=self._headers(),
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning(
                "Failed to create intervention application_id=%s: %s",
                application_id,
                exc,
            )

    async def append_event(
        self,
        application_id: str,
        *,
        event_type: str,
        description: str,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        url = f"{self._base_url}/v1/applications/internal/{application_id}/events"
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    url,
                    json={
                        "type": event_type,
                        "description": description,
                        "metadata": metadata or {},
                    },
                    headers=self._headers(),
                )
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning(
                "Failed to append application event application_id=%s: %s",
                application_id,
                exc,
            )
