"""HTTP client for job-agent ingest endpoints."""

from __future__ import annotations

import logging

import httpx
from pydantic import ValidationError

from config import settings
from models import CompanyTarget, DiscoveredJobRecord
from services.score_contract import ScoreResult

logger = logging.getLogger(__name__)


class JobAgentClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.job_agent_url).rstrip("/")

    async def search_jobs(
        self,
        job_title: str,
        *,
        skills: list[str] | None = None,
        experience_years: int = 0,
        max_companies: int = 15,
        max_jobs_per_company: int = 50,
        summary: str | None = None,
        recent_role: str | None = None,
        recent_highlights: list[str] | None = None,
    ) -> list[DiscoveredJobRecord]:
        url = f"{self._base_url}/search/semantic"
        payload = {
            "job_title": job_title,
            "skills": skills or [],
            "experience_years": experience_years,
            "max_companies": max_companies,
            "max_jobs_per_company": max_jobs_per_company,
            "summary": summary,
            "recent_role": recent_role,
            "recent_highlights": recent_highlights or [],
        }
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
        return [_job_from_search_item(item) for item in data.get("jobs", [])]

    async def scrape_career_page(
        self,
        career_page_url: str,
        *,
        job_role: str | None = None,
        company_name: str | None = None,
    ) -> list[DiscoveredJobRecord]:
        url = f"{self._base_url}/scrape/page"
        payload = {
            "career_page_url": career_page_url,
            "job_role": job_role,
            "company_name": company_name,
        }
        async with httpx.AsyncClient(timeout=max(settings.http_timeout_seconds, 90.0)) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
        return [_job_from_search_item(item) for item in data.get("jobs", [])]

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

    async def detect_ats(
        self,
        career_page_url: str,
    ) -> tuple[str | None, str | None, str]:
        url = f"{self._base_url}/detect"
        payload = {"career_page_url": career_page_url}

        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()

        return (
            data.get("ats_type"),
            data.get("suggested_slug"),
            data.get("confidence", "none"),
        )

    async def detect_target_from_funded_company(
        self,
        company: dict,
    ) -> CompanyTarget | None:
        name = str(company.get("name", "")).strip()
        domain = company.get("domain")
        if not name:
            return None

        career_urls: list[str] = []
        if isinstance(domain, str) and domain:
            career_urls.extend(
                [
                    f"https://{domain}/careers",
                    f"https://www.{domain}/careers",
                    f"https://{domain}/jobs",
                    f"https://www.{domain}/jobs",
                ]
            )

        press_url = company.get("press_url")
        if isinstance(press_url, str) and press_url.startswith("http"):
            career_urls.append(press_url)

        for career_page_url in career_urls:
            try:
                ats_type, slug, confidence = await self.detect_ats(career_page_url)
            except httpx.HTTPError as exc:
                logger.warning("ATS detect failed for %s: %s", career_page_url, exc)
                continue

            if ats_type and slug and confidence in {"high", "low"}:
                return CompanyTarget(
                    company_name=name,
                    ats_type=ats_type,
                    ats_slug=slug,
                )

        return None

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self._base_url}/health")
                return response.status_code == 200
        except httpx.HTTPError:
            return False


_KNOWN_SOURCES = {
    "greenhouse",
    "lever",
    "ashby",
    "workable",
    "recruitee",
    "personio",
    "wellfound",
    "generic",
}


def _job_from_search_item(item: dict) -> DiscoveredJobRecord:
    source = item.get("source") or item.get("ats_type") or "generic"
    if source not in _KNOWN_SOURCES:
        source = "generic"
    score_result: ScoreResult | None = None
    raw_score = item.get("score_result")
    if isinstance(raw_score, dict):
        try:
            score_result = ScoreResult.model_validate(raw_score)
        except ValidationError:
            score_result = None
    return DiscoveredJobRecord(
        external_id=str(item.get("external_id") or ""),
        source=source,  # type: ignore[arg-type]
        title=str(item.get("title") or ""),
        company_name=str(item.get("company_name") or ""),
        department=item.get("department"),
        location=item.get("location"),
        location_type=item.get("location_type"),
        seniority=item.get("seniority"),
        application_url=item.get("application_url"),
        description_raw=item.get("description") or item.get("description_raw"),
        dedup_key=str(item.get("dedup_key") or ""),
        filter_score=(
            score_result.score
            if score_result
            else float(item.get("semantic_score") or item.get("filter_score") or 0.0)
        ),
        filter_score_result=score_result,
    )
