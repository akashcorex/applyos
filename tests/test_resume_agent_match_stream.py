from __future__ import annotations

from typing import Any

import httpx
import pytest

from models import ResumeRecord
from services.matcher import JobMatcher
from services.matching.sse import format_sse, parse_sse_buffer


def _job(company: str, semantic: float = 0.9) -> dict[str, Any]:
    return {
        "title": "Senior Python Engineer",
        "company_name": company,
        "location": "Remote",
        "location_type": "remote",
        "application_url": f"https://example.com/{company}",
        "dedup_key": f"{company}::1",
        "ats_type": "greenhouse",
        "ats_slug": company,
        "semantic_score": semantic,
        "match_reason": "Python fit.",
        "matching_skills": ["Python"],
        "missing_skills": [],
    }


class _FakeStreamResponse:
    def __init__(self, text: str) -> None:
        self._text = text

    def raise_for_status(self) -> None:
        return None

    async def aiter_text(self):
        for index in range(0, len(self._text), 64):
            yield self._text[index : index + 64]

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class _FakeStreamClient:
    def __init__(self, text: str = "", *, fail: bool = False) -> None:
        self._text = text
        self.fail = fail
        self.posts: list[dict[str, Any]] = []

    def stream(self, method: str, url: str, **kwargs):
        self.posts.append({"url": url, "json": kwargs.get("json")})
        if self.fail:
            raise httpx.ConnectError("stream down")
        return _FakeStreamResponse(self._text)


def _resume() -> ResumeRecord:
    return ResumeRecord(
        user_id="user-1",
        full_name="Jane Doe",
        email="jane@example.com",
        skills=["Python"],
        experience_years=5,
        preferred_role="Engineer",
    )


def test_sse_buffer_split_across_chunks() -> None:
    text = format_sse("batch", {"jobs": []}) + format_sse("done", {"n": 1})
    frames, leftover = parse_sse_buffer(text[: len(text) // 2])
    assert frames == []
    frames2, leftover2 = parse_sse_buffer(leftover + text[len(text) // 2 :])
    assert frames2 == [("batch", {"jobs": []}), ("done", {"n": 1})]
    assert leftover2 == ""


@pytest.mark.asyncio
async def test_match_stream_yields_batches_then_done() -> None:
    text = format_sse("batch", {"company": "Stripe", "jobs": [_job("stripe")]})
    text += format_sse("batch", {"company": "Vercel", "jobs": [_job("vercel", 0.1)]})
    client = _FakeStreamClient(text)
    matcher = JobMatcher(client)

    frames = [frame async for frame in matcher.match_stream(_resume(), "r-1")]
    assert [frame["event"] for frame in frames] == ["batch", "batch", "done"]
    assert frames[0]["data"]["company"] == "Stripe"
    assert len(frames[0]["data"]["jobs"]) == 1
    assert frames[0]["data"]["jobs"][0]["match_score"] > 0
    assert frames[2]["data"]["companies_scraped"] == 2
    assert frames[2]["data"]["total_matches"] == 2
    assert client.posts[0]["url"].endswith("/search/semantic/stream")


@pytest.mark.asyncio
async def test_match_stream_error_frame_on_failure() -> None:
    matcher = JobMatcher(_FakeStreamClient(fail=True))
    frames = [frame async for frame in matcher.match_stream(_resume(), "r-1")]
    assert [frame["event"] for frame in frames] == ["error", "done"]
    assert frames[1]["data"]["total_matches"] == 0


@pytest.mark.asyncio
async def test_match_still_works_after_refactor() -> None:
    class _Response:
        def raise_for_status(self) -> None:
            return None

        def json(self):
            return {"companies_scraped": 1, "jobs": [_job("stripe")]}

    class _Client:
        async def post(self, url, json):
            return _Response()

    matcher = JobMatcher(_Client())
    response, _latency = await matcher.match(_resume(), "r-1")
    assert response.total_matches == 1
    assert response.jobs[0].company_name == "stripe"
