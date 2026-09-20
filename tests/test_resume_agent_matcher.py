from __future__ import annotations

from typing import Any

import pytest

from models import ResumeRecord
from services.matcher import JobMatcher
from services.skills import (
    combine_job_score,
    combine_match_score,
    normalize_skills,
    skill_overlap_score,
)


class _FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeClient:
    def __init__(self, payload: dict[str, Any], *, fail_semantic: bool = False) -> None:
        self._payload = payload
        self.fail_semantic = fail_semantic
        self.posted: list[dict[str, Any]] = []

    async def post(self, url: str, json: dict[str, Any]) -> _FakeResponse:
        self.posted.append({"url": url, "json": json})
        if self.fail_semantic and url.endswith("/search/semantic"):
            import httpx

            raise httpx.ConnectError("semantic down")
        return _FakeResponse(self._payload)


def _resume(skills: list[str], role: str = "Senior Full Stack Engineer") -> ResumeRecord:
    return ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=skills,
        experience_years=5,
        preferred_role=role,
    )


@pytest.mark.asyncio
async def test_match_uses_semantic_endpoint_and_weighted_score() -> None:
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
                "semantic_score": 0.9,
                "match_reason": "Strong backend Python fit with senior experience.",
                "matching_skills": ["Python"],
                "missing_skills": ["Django"],
            },
            {
                "title": "Marketing Lead",
                "company_name": "Notion",
                "location": "NYC",
                "seniority": "mid",
                "application_url": "https://example.com/2",
                "dedup_key": "notion::2",
                "ats_type": "lever",
                "ats_slug": "notion",
                "semantic_score": 0.05,
                "match_reason": "Marketing role unrelated to engineering profile.",
                "matching_skills": [],
                "missing_skills": ["SEO", "Content Strategy"],
            },
            {
                "title": "Full Stack TypeScript Engineer",
                "company_name": "Vercel",
                "location": "Remote",
                "application_url": "https://example.com/3",
                "dedup_key": "vercel::3",
                "ats_type": "greenhouse",
                "ats_slug": "vercel",
                "semantic_score": 0.85,
                "match_reason": "Full-stack TypeScript/React alignment.",
                "matching_skills": ["TypeScript", "React"],
                "missing_skills": [],
            },
        ],
    }
    client = _FakeClient(payload)
    matcher = JobMatcher(client)

    response, _latency = await matcher.match(
        resume=_resume(["Python", "React", "TypeScript"]),
        resume_id="r-1",
        max_companies=5,
        max_jobs=20,
    )

    assert len(client.posted) == 1
    assert client.posted[0]["url"].endswith("/search/semantic")
    assert client.posted[0]["json"]["job_title"] == "Senior Full Stack Engineer"
    assert client.posted[0]["json"]["skills"] == ["Python", "React", "TypeScript"]
    assert client.posted[0]["json"]["experience_years"] == 5

    assert response.total_matches == 3
    assert response.companies_scraped == 3

    # Top jobs should be engineering; marketing should be last and < 20.
    assert response.jobs[0].company_name in {"Stripe", "Vercel"}
    marketing = response.jobs[-1]
    assert marketing.company_name == "Notion"
    assert marketing.match_score < 20
    assert marketing.matched_skills == []
    assert "SEO" in marketing.missing_skills
    assert "unrelated" in marketing.reason.lower() or "marketing" in marketing.reason.lower()

    vercel = next(j for j in response.jobs if j.company_name == "Vercel")
    # 45% * 0.85 + 15% * 0.85 + 30% * (2/3) + 10% * 0.5 (neutral recency)
    assert vercel.match_score == combine_job_score(0.85, 0.85, 2 / 3, 0.5)[0]
    assert vercel.score_breakdown == {
        "text": 0.85,
        "title": 0.85,
        "skill": round(2 / 3, 4),
        "recency": 0.5,
    }
    assert set(vercel.matched_skills) == {"TypeScript", "React"}
    assert vercel.missing_skills == []
    assert "TypeScript" in vercel.reason or "Full-stack" in vercel.reason


@pytest.mark.asyncio
async def test_match_falls_back_to_keyword_search() -> None:
    payload = {
        "companies_scraped": 1,
        "jobs": [
            {
                "title": "Senior Python Engineer",
                "company_name": "Stripe",
                "location": "Remote",
                "application_url": "https://example.com/1",
                "dedup_key": "stripe::1",
                "ats_type": "greenhouse",
                "ats_slug": "stripe",
            }
        ],
    }
    client = _FakeClient(payload, fail_semantic=True)
    matcher = JobMatcher(client)

    response, _ = await matcher.match(
        resume=_resume(["Python", "React"]),
        resume_id="r-1",
    )

    assert len(client.posted) == 2
    assert client.posted[0]["url"].endswith("/search/semantic")
    assert client.posted[1]["url"].endswith("/search")
    assert response.total_matches == 1
    assert response.jobs[0].matched_skills == ["Python"]
    assert response.jobs[0].match_score > 0


@pytest.mark.asyncio
async def test_match_returns_empty_on_http_error() -> None:
    import httpx

    class _ErrorClient:
        async def post(self, url: str, json: dict[str, Any]) -> _FakeResponse:
            raise httpx.ConnectError("job-agent down")

    matcher = JobMatcher(_ErrorClient())  # type: ignore[arg-type]
    response, _ = await matcher.match(
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

    assert client.posted[0]["json"]["job_title"] == "Software Engineer"


@pytest.mark.asyncio
async def test_match_drops_senior_roles_for_one_year_experience() -> None:
    payload = {
        "companies_scraped": 2,
        "jobs": [
            {
                "title": "Senior Software Engineer",
                "company_name": "Acme",
                "dedup_key": "acme::senior",
                "semantic_score": 0.99,
            },
            {
                "title": "Junior Software Engineer",
                "company_name": "Beta",
                "dedup_key": "beta::junior",
                "semantic_score": 0.4,
            },
        ],
    }
    client = _FakeClient(payload)
    matcher = JobMatcher(client)
    resume = _resume(["Python"], role="Software Engineer")
    resume.experience_years = 1

    response, _ = await matcher.match(resume=resume, resume_id="r-4")

    assert [job.title for job in response.jobs] == ["Junior Software Engineer"]
    assert response.total_matches == 1


@pytest.mark.asyncio
async def test_match_applies_canonical_profile_filters() -> None:
    payload = {
        "companies_scraped": 4,
        "jobs": [
            {
                "title": "Senior Engineer",
                "company_name": "Acme",
                "location": "Bengaluru",
                "location_type": "remote",
                "seniority": "senior",
                "dedup_key": "acme::senior",
                "semantic_score": 0.9,
            },
            {
                "title": "Junior Engineer",
                "company_name": "Beta",
                "location": "Bengaluru",
                "location_type": "remote",
                "seniority": "junior",
                "dedup_key": "beta::junior",
                "semantic_score": 0.8,
            },
            {
                "title": "Junior Engineer",
                "company_name": "Gamma",
                "location": "Bengaluru",
                "location_type": "onsite",
                "seniority": "junior",
                "dedup_key": "gamma::onsite",
                "semantic_score": 0.8,
            },
            {
                "title": "Junior Engineer",
                "company_name": "Delta",
                "location": "New York",
                "location_type": "remote",
                "seniority": "junior",
                "dedup_key": "delta::remote",
                "semantic_score": 0.8,
            },
        ],
    }
    matcher = JobMatcher(_FakeClient(payload))

    response, _ = await matcher.match(
        resume=_resume(["Python"]),
        resume_id="r-profile-filters",
        profile_seniority="junior",
        profile_work_mode="remote",
        profile_locations=["Bengaluru"],
    )

    assert [job.company_name for job in response.jobs] == ["Beta"]


def test_normalize_skills_aliases_and_dedupe() -> None:
    assert normalize_skills(["JS", "js", "Next", "ReactJS", "Python"]) == [
        "JavaScript",
        "Next.js",
        "React",
        "Python",
    ]


def test_combine_match_score_weights() -> None:
    # 70% embedding + 30% skills
    assert combine_match_score(1.0, 0.0) == 70.0
    assert combine_match_score(0.0, 1.0) == 30.0
    assert combine_match_score(1.0, 1.0) == 100.0
    assert skill_overlap_score(["Python"], ["Django"]) == 0.5


def test_combine_job_score_weights_and_breakdown() -> None:
    # 45% text + 15% title + 30% skill + 10% recency
    score, parts = combine_job_score(1.0, 1.0, 1.0, 1.0)
    assert score == 100.0
    assert parts == {"text": 1.0, "title": 1.0, "skill": 1.0, "recency": 1.0}
    score, _ = combine_job_score(1.0, 0.0, 0.0, 0.0)
    assert score == 45.0
    score, _ = combine_job_score(0.0, 0.0, 0.0, 0.0)
    assert score == 0.0


@pytest.mark.asyncio
async def test_match_passes_posted_at_through() -> None:
    client = _FakeClient(
        {
            "companies_scraped": 1,
            "jobs": [
                {
                    "title": "Engineer",
                    "company_name": "Acme",
                    "dedup_key": "acme::1",
                    "semantic_score": 0.8,
                    "posted_at": "2026-09-18T00:00:00+00:00",
                }
            ],
        }
    )
    matcher = JobMatcher(client)
    response, _ = await matcher.match(
        resume=_resume(["Python"]), resume_id="r-posted"
    )
    assert response.jobs[0].posted_at == "2026-09-18T00:00:00+00:00"


@pytest.mark.asyncio
async def test_match_sends_profile_filters_and_salary() -> None:
    payload = {
        "companies_scraped": 1,
        "jobs": [
            {
                "title": "Engineer",
                "company_name": "Acme",
                "dedup_key": "acme::1",
                "semantic_score": 0.8,
                "salary_min": 100000,
                "salary_max": 140000,
                "salary_currency": "USD",
            }
        ],
    }
    client = _FakeClient(payload)
    matcher = JobMatcher(client)
    response, _ = await matcher.match(
        resume=_resume(["Python"]),
        resume_id="r-filters",
        profile_seniority="mid",
        profile_work_mode="remote",
        profile_locations=["Remote"],
    )
    sent = client.posted[0]["json"]
    assert sent["profile_seniority"] == "mid"
    assert sent["profile_work_mode"] == "remote"
    assert sent["profile_locations"] == ["Remote"]
    job = response.jobs[0]
    assert job.salary_min == 100000
    assert job.salary_max == 140000
    assert job.salary_currency == "USD"
