from __future__ import annotations

import logging

import httpx

from config import settings
from models import CompanyTarget
from services.job_client import JobAgentClient

logger = logging.getLogger(__name__)


class FundingClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.job_agent_url).rstrip("/")

    async def scrape_funding(
        self,
        *,
        sources: list[str] | None = None,
        limit: int = 20,
        min_round: str | None = None,
        since_date: str | None = None,
        enrich_domains: bool = True,
    ) -> list[dict]:
        payload: dict[str, object] = {
            "limit": limit,
            "enrich_domains": enrich_domains,
        }
        if sources is not None:
            payload["sources"] = sources
        if min_round is not None:
            payload["min_round"] = min_round
        if since_date is not None:
            payload["since_date"] = since_date

        url = f"{self._base_url}/funding/scrape"
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        companies = data.get("companies", [])
        if not isinstance(companies, list):
            return []
        return companies

    async def resolve_targets(
        self,
        job_client: JobAgentClient,
        *,
        sources: list[str] | None = None,
        limit: int = 20,
        min_round: str | None = None,
        since_date: str | None = None,
    ) -> list[CompanyTarget]:
        companies = await self.scrape_funding(
            sources=sources,
            limit=limit,
            min_round=min_round,
            since_date=since_date,
            enrich_domains=True,
        )

        targets: list[CompanyTarget] = []
        for company in companies:
            target = await job_client.detect_target_from_funded_company(company)
            if target is not None:
                targets.append(target)
            else:
                logger.info(
                    "Skipping funded company without detectable ATS: %s",
                    company.get("name"),
                )

        return targets
