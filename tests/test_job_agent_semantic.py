from __future__ import annotations

import pytest

import services.semantic_match as semantic_module
from models import SearchResult, SemanticMatchResult
from services.semantic_match import (
    build_candidate_text,
    build_job_text,
    cosine_similarity,
    semantic_rank_jobs,
    JobExplanation,
    JobExplanations,
)
from services.skill_utils import infer_skill_overlap, match_skills_in_text


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
        description=kwargs.get("description"),
    )


@pytest.mark.asyncio
async def test_semantic_rank_jobs_with_embeddings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(semantic_module.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "")
    monkeypatch.setattr(semantic_module.settings, "semantic_top_k", 20)
    monkeypatch.setattr(semantic_module.settings, "explain_top_k", 10)

    async def _fake_embed(texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            if "Target Role" in text:
                vectors.append([1.0, 0.0, 0.0])
            elif "Python" in text:
                vectors.append([0.95, 0.05, 0.0])
            elif "Marketing" in text:
                vectors.append([0.0, 1.0, 0.0])
            else:
                vectors.append([0.5, 0.5, 0.0])
        return vectors

    monkeypatch.setattr(semantic_module, "embed_texts", _fake_embed)

    jobs = [
        _make_job("Senior Python Engineer", "Stripe", description="Python backend"),
        _make_job("Marketing Lead", "Notion", description="SEO and content"),
    ]

    ranked = await semantic_rank_jobs(
        jobs,
        skills=["Python", "React"],
        preferred_role="Senior Engineer",
        experience_years=5,
    )

    assert len(ranked) == 2
    assert ranked[0].company_name == "Stripe"
    assert ranked[0].semantic_score > ranked[1].semantic_score
    assert ranked[1].company_name == "Notion"
    assert ranked[0].matching_skills  # rule-based skills for all jobs
    assert ranked[1].semantic_score < 0.5


@pytest.mark.asyncio
async def test_semantic_rank_jobs_with_llm_explanation(monkeypatch: pytest.MonkeyPatch) -> None:
    from langchain_core.runnables import RunnableLambda

    monkeypatch.setattr(semantic_module.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "explain_top_k", 2)

    async def _fake_embed(texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0]] * len(texts)

    monkeypatch.setattr(semantic_module, "embed_texts", _fake_embed)

    explanations = JobExplanations(
        explanations=[
            JobExplanation(
                job_index=0,
                reason="Strong Python backend fit.",
                matching_skills=["Python"],
                missing_skills=["Django"],
            ),
        ]
    )

    class _FakeChatAnthropic:
        def with_structured_output(self, schema, **kwargs):
            async def _fake_ainvoke(input_dict, config=None, **kw):
                return explanations

            return RunnableLambda(_fake_ainvoke)

    monkeypatch.setattr(semantic_module, "_get_llm", lambda: _FakeChatAnthropic())
    monkeypatch.setattr(semantic_module, "_llm", None)

    jobs = [_make_job("Senior Python Engineer", "Stripe", description="Python required")]

    ranked = await semantic_rank_jobs(
        jobs,
        skills=["Python"],
        preferred_role="Engineer",
    )

    assert len(ranked) == 1
    assert ranked[0].semantic_score > 0
    assert ranked[0].match_reason == "Strong Python backend fit."
    assert ranked[0].matching_skills == ["Python"]
    assert ranked[0].missing_skills == ["Django"]
    assert isinstance(ranked[0], SemanticMatchResult)


@pytest.mark.asyncio
async def test_semantic_rank_uses_cached_profile_embedding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(semantic_module.settings, "openai_api_key", "test-key")
    monkeypatch.setattr(semantic_module.settings, "anthropic_api_key", "")

    embedded: list[list[str]] = []

    async def _fake_embed(texts: list[str]) -> list[list[float]]:
        embedded.extend(texts)
        return [[0.9, 0.1]] * len(texts)

    monkeypatch.setattr(semantic_module, "embed_texts", _fake_embed)

    jobs = [_make_job("Engineer", "Acme")]
    cached = [1.0, 0.0]

    await semantic_rank_jobs(
        jobs,
        skills=["Python"],
        preferred_role="Engineer",
        profile_embedding=cached,
    )

    assert len(embedded) == 1
    assert "Target Role" not in embedded[0]


@pytest.mark.asyncio
async def test_semantic_rank_jobs_fallback_without_api_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(semantic_module.settings, "openai_api_key", "")

    jobs = [_make_job("Engineer", "Acme")]
    ranked = await semantic_rank_jobs(jobs, skills=["Python"], preferred_role="Engineer")

    assert len(ranked) == 1
    assert ranked[0].semantic_score == 0.0
    assert isinstance(ranked[0], SemanticMatchResult)


@pytest.mark.asyncio
async def test_semantic_rank_empty_jobs() -> None:
    ranked = await semantic_rank_jobs([], skills=["Python"], preferred_role="Engineer")
    assert ranked == []


def test_cosine_similarity_identical_vectors() -> None:
    vec = [1.0, 2.0, 3.0]
    assert cosine_similarity(vec, vec) == pytest.approx(1.0, abs=1e-6)


def test_cosine_similarity_orthogonal_vectors() -> None:
    assert cosine_similarity([1.0, 0.0], [0.0, 1.0]) == pytest.approx(0.0, abs=1e-6)


def test_build_candidate_text_includes_summary() -> None:
    text = build_candidate_text(
        "SDE",
        ["Python"],
        2,
        summary="Backend engineer",
        recent_role="Junior SDE",
        recent_highlights=["Built APIs"],
    )
    assert "Target Role: SDE" in text
    assert "Summary: Backend engineer" in text
    assert "Recent work: Built APIs" in text


def test_build_job_text_includes_description() -> None:
    job = _make_job("Eng", "Co", description="Looking for Python experience")
    text = build_job_text(job)
    assert "Description: Looking for Python experience" in text
    assert "Requirements:" in text


def test_skill_utils_word_boundary() -> None:
    matched = match_skills_in_text(["Python"], "Senior Python Engineer role")
    assert matched == ["Python"]
    assert match_skills_in_text(["Python"], "Senior Java Engineer") == []


def test_infer_skill_overlap() -> None:
    matched, missing = infer_skill_overlap(
        ["Python", "React"],
        "Python and Django required. React a plus.",
    )
    assert "Python" in matched
    assert "Django" in missing
