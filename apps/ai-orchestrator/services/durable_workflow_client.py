"""Best-effort bridge from the live Redis workflow to durable API records."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)


class DurableWorkflowClient:
    """Send workflow state transitions to the API without blocking automation.

    The API is the system of record for user history. Redis remains the fast
    coordination store, so a temporary API outage must never cause a browser
    application task to be retried or submitted twice.
    """

    def __init__(self) -> None:
        self._base_url = settings.api_url.rstrip("/")
        self._token = settings.agent_service_token

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def get_application(self, application_id: str) -> dict[str, Any] | None:
        """Load the durable application snapshot required for a safe retry."""
        if not self.enabled:
            return None
        try:
            async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
                response = await client.get(
                    f"{self._base_url}/v1/workflows/internal/applications/{application_id}",
                    headers={"X-Agent-Service-Token": self._token},
                )
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                return response.json()
        except httpx.HTTPError as exc:
            logger.warning("Could not load durable application %s: %s", application_id, exc)
            return None

    async def get_workflow(self, workflow_id: str) -> dict[str, Any] | None:
        """Load a durable workflow row (used to verify ownership on start)."""
        if not self.enabled:
            return None
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(
                f"{self._base_url}/v1/workflows/internal/{workflow_id}",
                headers={"X-Agent-Service-Token": self._token},
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()

    async def resolve_application_id(
        self,
        workflow_run_id: str,
        dedup_key: str,
    ) -> str | None:
        """Resolve the Postgres application id for a workflow job."""
        if not self.enabled:
            return None
        try:
            async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
                response = await client.get(
                    f"{self._base_url}/v1/applications/internal/resolve",
                    params={"workflowRunId": workflow_run_id, "dedupKey": dedup_key},
                    headers={"X-Agent-Service-Token": self._token},
                )
                if response.status_code == 404:
                    return None
                response.raise_for_status()
                data = response.json()
                app_id = data.get("applicationId")
                return str(app_id) if isinstance(app_id, str) else None
        except httpx.HTTPError as exc:
            logger.warning(
                "Could not resolve application for workflow=%s dedup=%s: %s",
                workflow_run_id,
                dedup_key,
                exc,
            )
            return None

    async def sync_status(
        self,
        workflow_id: str,
        status: str,
        *,
        event_type: str = "workflow.status_changed",
        event_key: str | None = None,
        payload: dict[str, Any] | None = None,
        applications: list[dict[str, Any]] | None = None,
        error_detail: str | None = None,
    ) -> None:
        if not self.enabled:
            return

        body: dict[str, Any] = {
            "status": status,
            "eventType": event_type,
            "payload": payload or {"status": status},
        }
        if event_key:
            body["eventKey"] = event_key
        if applications:
            body["applications"] = applications
        if error_detail:
            body["errorDetail"] = error_detail

        try:
            async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
                response = await client.post(
                    f"{self._base_url}/v1/workflows/internal/{workflow_id}/status",
                    json=body,
                    headers={"X-Agent-Service-Token": self._token},
                )
                if response.status_code == 404:
                    # Autonomous legacy runs are not created in Postgres yet.
                    return
                response.raise_for_status()
        except httpx.HTTPError as exc:
            logger.warning(
                "Durable workflow sync failed workflow=%s status=%s: %s",
                workflow_id,
                status,
                exc,
            )
