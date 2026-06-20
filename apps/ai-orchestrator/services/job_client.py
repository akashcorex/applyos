"""HTTP client for job-agent ingest endpoints."""

from __future__ import annotations

import logging

import httpx

from config import settings
from models import CompanyTarget, DiscoveredJobRecord

logger = logging.getLogger(__name__)


class JobAgentClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.job_agent_url).rstrip("/")

    async def ingest_company(self, target: CompanyTarget) -> list[DiscoveredJobRecord]:
        url = f"{self._base_url}/ingest/{target.ats_type}"
        payload = {
            "ats_slug": target.ats_slug,
            "company_id": target.company_name,
        }

        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        jobs: list[DiscoveredJobRecord] = []
        for item in data.get("jobs", []):
            application_url = item.get("application_url")
            if not application_url:
                logger.warning(
                    "Job missing application_url: %s at %s",
                    item.get("title"),
                    target.company_name,
                )

            jobs.append(
                DiscoveredJobRecord(
                    external_id=str(item.get("external_id", "")),
                    source=item.get("source", target.ats_type),
                    title=str(item.get("title", "")),
                    company_name=target.company_name,
                    department=item.get("department"),
                    location=item.get("location"),
                    location_type=item.get("location_type"),
                    seniority=item.get("seniority"),
                    application_url=application_url,
                    description_raw=item.get("description_raw"),
                    dedup_key=str(item.get("dedup_key", "")),
                )
            )

        return jobs

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self._base_url}/health")
                return response.status_code == 200
        except httpx.HTTPError:
            return False
