from __future__ import annotations

import pytest
from langchain_core.runnables import RunnableLambda

import services.semantic_match as semantic_module
from models import SearchResult, SemanticMatchResult
from services.semantic_match import semantic_rank_jobs, JobScore, SemanticScores


def _make_job(title: str, company: str, **kwargs) -> SearchResult:
    return SearchResult(
        external_id="1",
        source="greenhouse",
        title=title,
        company_name=company,
        location=kwargs.get("location", "Remote"),
        location_type=kwargs.get("location_type", "remote"),
        seniority=kwargs.get("seniority", "senior"),
        application_url="https://example.com/1",
        dedup_key=f"{company}::{title}",
        ats_type="greenhouse",
        ats_slug=company.lower(),
    )


class _FakeChatAnthropic:
    def __init__(self, return_value) -> None:
        self._return_value = return_value

    def with_structured_output(self, schema, **kwargs):
        rv = self._return_value

        async def _fake_ainvoke(input_dict, config=None, **kw):
            return rv

        return RunnableLambda(_fake_ainvoke)


@pytest.mark.asyncio
async def test_semantic_rank_jobs_with_llm(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(semantic_module, "_llm", None)

    scores = SemanticScores(
        scores=[
            JobScore(job_index=0, score=0.95, reason="Perfect skill match", matching_skills=["Python"]),
            JobScore(job_index=1, score=0.3, reason="Different domain", matching_skills=[]),
        ]
    )
    fake_llm = _FakeChatAnthropic(scores)
    monkeypatch.setattr(semantic_module, "_get_llm", lambda: fake_llm)

    jobs = [
        _make_job("Senior Python Engineer", "Stripe"),
        _make_job("Marketing Lead", "Notion"),
    ]

    ranked = await semantic_rank_jobs(jobs, skills=["Python", "React"], preferred_role="Engineer")

    assert len(ranked) == 2
    assert ranked[0].company_name == "Stripe"
    assert ranked[0].semantic_score == 0.95
    assert ranked[0].matching_skills == ["Python"]
    assert ranked[1].company_name == "Notion"
    assert ranked[1].semantic_score == 0.3


@pytest.mark.asyncio
async def test_semantic_rank_jobs_fallback_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "")
    monkeypatch.setattr(semantic_module, "_llm", None)

    jobs = [_make_job("Engineer", "Acme")]
    ranked = await semantic_rank_jobs(jobs, skills=["Python"], preferred_role="Engineer")

    assert len(ranked) == 1
    assert ranked[0].semantic_score == 0.0
    assert isinstance(ranked[0], SemanticMatchResult)


@pytest.mark.asyncio
async def test_semantic_rank_empty_jobs() -> None:
    ranked = await semantic_rank_jobs([], skills=["Python"], preferred_role="Engineer")
    assert ranked == []
