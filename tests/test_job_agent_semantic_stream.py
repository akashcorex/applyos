from __future__ import annotations

import json

import pytest

import services.semantic_match as semantic_module
from models import SearchResult, SemanticSearchRequest
from routes import semantic as semantic_route
from services.semantic_match import semantic_rank_jobs
from services.sse import format_sse, parse_sse_frames


def _make_job(title: str, company: str) -> SearchResult:
    return SearchResult(
        external_id="1",
        source="greenhouse",
        title=title,
        company_name=company,
        location="Remote",
        location_type="remote",
        seniority=None,
        application_url="https://example.com/1",
        dedup_key=f"{company}::{title}",
        ats_type="greenhouse",
        ats_slug=company.lower(),
        description="Python backend role",
    )


def test_sse_helpers_round_trip() -> None:
    text = format_sse("batch", {"jobs": []}) + format_sse("done", {"n": 1})
    assert parse_sse_frames(text) == [(("batch", {"jobs": []})), (("done", {"n": 1}))]
    assert parse_sse_frames("event: batch\ndata: not-json\n\n") == []


@pytest.mark.asyncio
async def test_rank_all_skips_truncation_and_llm(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(semantic_module.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "semantic_top_k", 20)

    async def _fake_embed(texts: list[str]) -> list[list[float]]:
        return [[0.9, 0.1]] * len(texts)

    def _boom_llm():
        raise AssertionError("LLM must not run when rank_all=True")

    monkeypatch.setattr(semantic_module, "embed_texts", _fake_embed)
    monkeypatch.setattr(semantic_module, "_get_llm", _boom_llm)

    jobs = [_make_job(f"Engineer {index}", "Acme") for index in range(25)]
    ranked = await semantic_rank_jobs(
        jobs, skills=["Python"], preferred_role="Engineer", rank_all=True
    )
    assert len(ranked) == 25
    assert all(job.semantic_score > 0 for job in ranked)


@pytest.mark.asyncio
async def test_semantic_stream_emits_batches_then_done(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from models import SemanticMatchResult

    from services.company_scrape import CompanyScrapeResult

    async def fake_scrape(company, max_jobs):
        if company["domain"] == "dead.com":
            raise RuntimeError("ats down")
        return CompanyScrapeResult(
            jobs=[_make_job("Backend Engineer", str(company["name"]))],
            via_fallback=True,
        )

    async def fake_rank(jobs, **kwargs):
        assert kwargs.get("rank_all") is True
        return [SemanticMatchResult(**job.model_dump()) for job in jobs]

    monkeypatch.setattr(semantic_route, "scrape_company_jobs", fake_scrape)
    monkeypatch.setattr(
        semantic_route,
        "get_searchable_companies",
        lambda limit, pack=None: [
            {"name": "Acme", "domain": "acme.com"},
            {"name": "Dead", "domain": "dead.com"},
        ],
    )
    monkeypatch.setattr(semantic_route, "semantic_rank_jobs", fake_rank)

    response = await semantic_route.semantic_stream(
        SemanticSearchRequest(job_title="engineer", skills=[])
    )
    assert response.media_type == "text/event-stream"
    text = "".join([chunk async for chunk in response.body_iterator])
    frames = parse_sse_frames(text)
    assert [name for name, _ in frames] == ["batch", "batch", "done"]
    assert len(frames[0][1]["jobs"]) == 1
    assert frames[0][1]["board_attempt"]["status"] == "ok"
    assert frames[1][1]["jobs"] == []
    assert frames[1][1]["board_attempt"]["status"] == "error"
    assert frames[2][1]["companies_scraped"] == 1
    assert frames[2][1]["jobs_scraped"] == 1
    json.dumps(frames)
