from __future__ import annotations

from typing import Any

import pytest

from models import ResumeRecord
from services.matcher import JobMatcher


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload
        self.posted: dict[str, Any] | None = None

    async def post(self, url: str, json: dict[str, Any]) -> _FakeResponse:
        self.posted = {"url": url, "json": json}
        return _FakeResponse(self._payload)


def _resume(skills: list[str], role: str = "Senior Full Stack Engineer") -> ResumeRecord:
    return ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=skills,
        preferred_role=role,
    )


@pytest.mark.asyncio
async def test_match_ranks_by_skill_overlap() -> None:
    payload = {
        "companies_scraped": 3,
        "jobs": [
            {
                "title": "Senior Python Engineer",
                "company_name": "Stripe",
                "location": "Remote",
                "location_type": "remote",
                "application_url": "https://example.com/1",
                "dedup_key": "stripe::1",
                "ats_type": "greenhouse",
                "ats_slug": "stripe",
            },
            {
                "title": "Marketing Lead",
                "company_name": "Notion",
                "location": "NYC",
                "application_url": "https://example.com/2",
                "dedup_key": "notion::2",
                "ats_type": "lever",
                "ats_slug": "notion",
            },
            {
                "title": "Full Stack TypeScript Engineer",
                "company_name": "Vercel",
                "location": "Remote",
                "application_url": "https://example.com/3",
                "dedup_key": "vercel::3",
                "ats_type": "greenhouse",
                "ats_slug": "vercel",
            },
        ],
    }
    client = _FakeClient(payload)
    matcher = JobMatcher(client)

    response = await matcher.match(
        resume=_resume(["Python", "React", "TypeScript"]),
        resume_id="r-1",
        max_companies=5,
        max_jobs=20,
    )

    assert client.posted is not None
    assert client.posted["url"].endswith("/search")
    assert client.posted["json"]["job_title"] == "Senior Full Stack Engineer"

    assert response.total_matches == 3
    assert response.companies_scraped == 3
    # Vercel + Stripe both match skills; the marketing job matches none.
    assert response.jobs[0].company_name in {"Stripe", "Vercel"}
    assert response.jobs[-1].company_name == "Notion"
    assert response.jobs[-1].match_score == 0.0
    assert response.jobs[-1].matching_skills == []

    skills_used = set(response.skills_used)
    assert {"Python", "TypeScript"}.issubset(skills_used)
    assert "React" not in skills_used


@pytest.mark.asyncio
async def test_match_returns_empty_on_http_error() -> None:
    import httpx

    class _ErrorClient:
        async def post(self, url: str, json: dict[str, Any]) -> _FakeResponse:
            raise httpx.ConnectError("job-agent down")

    matcher = JobMatcher(_ErrorClient())  # type: ignore[arg-type]
    response = await matcher.match(
        resume=_resume(["Python"], role="Engineer"),
        resume_id="r-2",
    )

    assert response.total_matches == 0
    assert response.companies_scraped == 0
    assert response.jobs == []
    assert response.preferred_role == "Engineer"


@pytest.mark.asyncio
async def test_match_falls_back_to_default_role_when_missing() -> None:
    client = _FakeClient({"companies_scraped": 0, "jobs": []})
    matcher = JobMatcher(client)

    await matcher.match(
        resume=_resume(["Python"], role=""),
        resume_id="r-3",
    )

    assert client.posted is not None
    assert client.posted["json"]["job_title"] == "Software Engineer"
