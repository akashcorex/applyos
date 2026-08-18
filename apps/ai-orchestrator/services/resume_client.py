"""HTTP client for resume-agent."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings
from models import CVData

logger = logging.getLogger(__name__)


class ResumeAgentClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base_url = (base_url or settings.resume_agent_url).rstrip("/")

    async def get_resume(self, resume_id: str, user_id: str) -> dict[str, Any]:
        url = f"{self._base_url}/resume/{resume_id}"
        async with httpx.AsyncClient(timeout=settings.http_timeout_seconds) as client:
            response = await client.get(url, headers={"X-User-Id": user_id})
            response.raise_for_status()
            return response.json()

    async def get_cv_data(self, resume_id: str, user_id: str) -> CVData:
        data = await self.get_resume(resume_id, user_id)
        return cv_data_from_resume(data)

    async def health(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(f"{self._base_url}/health")
                return response.status_code == 200
        except httpx.HTTPError:
            return False


def cv_data_from_resume(data: dict[str, Any]) -> CVData:
    education = data.get("education") or []
    work_history = data.get("work_history") or []
    return CVData(
        full_name=str(data.get("full_name") or ""),
        email=str(data.get("email") or ""),
        phone=data.get("phone"),
        location=data.get("location"),
        summary=data.get("summary"),
        experience_years=int(data.get("experience_years") or 0),
        skills=list(data.get("skills") or []),
        education=[item if isinstance(item, dict) else dict(item) for item in education],
        work_history=[
            item if isinstance(item, dict) else dict(item) for item in work_history
        ],
        resume_url=data.get("file_path"),
        linkedin_url=data.get("linkedin_url"),
        github_url=data.get("github_url"),
        portfolio_url=data.get("portfolio_url"),
    )
