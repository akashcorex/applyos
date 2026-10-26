"""Cross-language drift guard for the unified score contract.

Mirrors `packages/validation/src/enums.drift.test.ts`: the TypeScript schema
in `packages/validation/src/score.ts` is the source of truth, its generated
JSON-schema snapshot is the checked-in bridge, and every agent-side Pydantic
mirror must match field names and enum literals.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import get_args

from services.score_contract import (
    SCORE_BANDS,
    SCORE_COMPONENT_NAMES,
    SCORE_CONFIDENCES,
    SCORE_DECISIONS,
    SCORE_EVIDENCE_TIERS,
    SCORE_IMPORTANCES,
    ScoreBand,
    ScoreConfidence,
    ScoreDecision,
    ScoreDimension,
    ScoreEvidenceTier,
    ScoreImportance,
    ScoreResult,
    build_score_result,
    decide_for_dimensions,
    legacy_score_result,
    mean_rating,
    not_evaluated_result,
    score_band,
    score_dimension,
)

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOT = ROOT / "packages" / "validation" / "contracts.snapshot.json"


def _load_contract_module(app: str, module_name: str):
    path = ROOT / "apps" / app / "services" / "score_contract.py"
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _score_schema() -> dict:
    snapshot = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    return snapshot["contracts"]["scoreResult"]


def test_python_model_fields_match_typescript_schema() -> None:
    schema = _score_schema()
    assert set(schema["properties"]) == set(ScoreResult.model_fields)
    assert set(schema["required"]) == set(ScoreResult.model_fields)

    dimension_schema = schema["properties"]["dimensions"]["items"]
    assert set(dimension_schema["properties"]) == set(
        ScoreDimension.model_fields
    )
    assert set(dimension_schema["required"]) == set(
        ScoreDimension.model_fields
    )


def test_python_literal_values_match_typescript_enums() -> None:
    schema = _score_schema()
    properties = schema["properties"]
    dimension_schema = properties["dimensions"]["items"]["properties"]

    assert list(get_args(ScoreBand)) == properties["band"]["enum"]
    assert list(get_args(ScoreDecision)) == properties["decision"]["enum"]
    assert list(get_args(ScoreConfidence)) == properties["confidence"]["enum"]
    assert list(get_args(ScoreEvidenceTier)) == properties["evidence_tier"]["enum"]
    assert list(get_args(ScoreImportance)) == dimension_schema["importance"]["enum"]
    assert (
        list(get_args(ScoreDimension.model_fields["name"].annotation))
        == dimension_schema["name"]["enum"]
    )
    assert (
        properties["evidence_tier"]["enum"]
        == dimension_schema["evidence_tier"]["enum"]
    )


def test_all_agent_contracts_agree() -> None:
    modules = [
        _load_contract_module("job-agent", "job_agent_score_contract"),
        _load_contract_module("resume-agent", "resume_agent_score_contract"),
        _load_contract_module("ai-orchestrator", "ai_orchestrator_score_contract"),
    ]
    for module in modules:
        assert module.SCORE_BANDS == SCORE_BANDS
        assert module.SCORE_DECISIONS == SCORE_DECISIONS
        assert module.SCORE_CONFIDENCES == SCORE_CONFIDENCES
        assert module.SCORE_EVIDENCE_TIERS == SCORE_EVIDENCE_TIERS
        assert module.SCORE_IMPORTANCES == SCORE_IMPORTANCES
        assert module.SCORE_COMPONENT_NAMES == SCORE_COMPONENT_NAMES


def test_band_boundaries_are_shared() -> None:
    expected = {
        -1.0: "poor",
        0.0: "poor",
        19.9: "poor",
        20.0: "weak",
        39.9: "weak",
        40.0: "moderate",
        59.9: "moderate",
        60.0: "good",
        79.9: "good",
        80.0: "strong",
        100.0: "strong",
        120.0: "strong",
    }
    assert {score: score_band(score) for score in expected} == expected


def test_a_failed_critical_dimension_outranks_a_strong_mean() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=5, evidence_tier="stated"),
            score_dimension("skills", rating=2, evidence_tier="stated"),
        ]
    )
    assert result.decision == "skip"
    assert result.rating == 3.5
    assert result.band == "weak"


def test_unknown_critical_means_maybe_and_lowers_confidence() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=4, evidence_tier="stated"),
            score_dimension("skills", rating=None, evidence_tier="stated"),
        ]
    )
    assert result.decision == "maybe"
    assert result.not_evaluated == ["skills"]
    assert result.confidence == "medium"


def test_inferred_evidence_cannot_drive_critical_or_high() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=5, evidence_tier="inferred"),
            score_dimension("skills", rating=5, evidence_tier="inferred"),
        ]
    )
    assert all(dimension.rating is None for dimension in result.dimensions)
    assert all(dimension.downgraded for dimension in result.dimensions)
    assert result.decision == "maybe"
    assert result.confidence == "low"


def test_an_inferred_rating_still_drives_medium_dimensions() -> None:
    dimensions = [
        score_dimension("title", rating=4, evidence_tier="inferred"),
        score_dimension("recency", rating=4, evidence_tier="inferred"),
    ]
    assert all(dimension.rating is not None for dimension in dimensions)
    # Rated, but nothing critical was judged: not a vacuous APPLY.
    assert decide_for_dimensions(dimensions) == "maybe"


def test_no_critical_dimension_can_never_be_an_apply() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("title", rating=5, evidence_tier="structural"),
            score_dimension("recency", rating=5, evidence_tier="structural"),
        ]
    )
    assert result.decision == "maybe"
    assert result.band == "moderate"


def test_a_low_importance_dimension_cannot_cross_the_apply_line() -> None:
    fit = [
        score_dimension("text", rating=4, evidence_tier="stated"),
        score_dimension("skills", rating=4, evidence_tier="stated"),
        score_dimension("recency", rating=1, evidence_tier="structural"),
    ]
    without = build_score_result(dimensions=fit)
    with_side_signal = build_score_result(
        dimensions=[
            *fit,
            score_dimension(
                "behavior",
                rating=5,
                importance="low",
                evidence_tier="inferred",
            ),
        ]
    )
    assert without.decision == "maybe"
    assert with_side_signal.decision == without.decision
    assert with_side_signal.rating == without.rating
    assert with_side_signal.score == without.score


def test_the_apply_line_is_reachable_at_a_70_score() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=4, evidence_tier="stated"),
            score_dimension("skills", rating=4, evidence_tier="stated"),
            score_dimension("title", rating=3, evidence_tier="structural"),
            score_dimension("recency", rating=3, evidence_tier="structural"),
        ]
    )
    assert result.decision == "apply"
    assert result.rating == 3.5
    assert result.score == 70


def test_rating_rounds_half_up_like_typescript() -> None:
    dimensions = [
        score_dimension("text", rating=4, evidence_tier="stated"),
        score_dimension("skills", rating=4, evidence_tier="stated"),
        score_dimension("title", rating=5, evidence_tier="structural"),
        score_dimension("recency", rating=4, evidence_tier="structural"),
    ]
    assert mean_rating(dimensions) == 4.3


def test_a_weak_low_importance_dimension_is_never_interview_risk() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=5, evidence_tier="stated"),
            score_dimension("skills", rating=4, evidence_tier="stated"),
            score_dimension(
                "behavior",
                rating=1,
                importance="low",
                evidence_tier="inferred",
                reason="You skipped similar roles.",
            ),
        ]
    )
    assert result.decision == "apply"
    assert result.interview_risk == []


def test_apply_requires_strong_critical_and_a_3_5_mean() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension("text", rating=5, evidence_tier="stated"),
            score_dimension("skills", rating=4, evidence_tier="stated"),
            score_dimension("seniority", rating=4, evidence_tier="stated"),
        ]
    )
    assert result.decision == "apply"
    assert result.rating == 4.3
    assert result.score == 86
    assert result.interview_risk == []


def test_a_weak_dimension_on_apply_names_the_interview_risk() -> None:
    result = build_score_result(
        dimensions=[
            score_dimension(
                "text", rating=5, evidence_tier="stated", reason="Direct match."
            ),
            score_dimension(
                "skills", rating=4, evidence_tier="stated", reason="Overlap."
            ),
            score_dimension(
                "seniority",
                rating=3,
                evidence_tier="stated",
                reason="Posting is one level up.",
            ),
        ]
    )
    assert result.decision == "apply"
    assert len(result.interview_risk) == 1
    assert "seniority" in result.interview_risk[0]


def test_unscored_result_states_what_is_missing() -> None:
    result = not_evaluated_result(
        "Semantic scoring unavailable.",
        ["semantic", "text", "title"],
    )
    assert result.decision == "skip"
    assert result.rating is None
    assert result.confidence == "low"
    assert result.not_evaluated == ["semantic", "text", "title"]
    assert result.dimensions == []


def test_legacy_scores_convert_to_a_decision() -> None:
    assert legacy_score_result(90).decision == "apply"
    assert legacy_score_result(75).decision == "maybe"
    assert legacy_score_result(50).decision == "skip"
    assert legacy_score_result(90).not_evaluated == ["dimensions"]


def test_legacy_bands_are_capped_by_the_implied_decision() -> None:
    assert legacy_score_result(90).band == "strong"
    assert legacy_score_result(84).band == "good"
    assert legacy_score_result(64).band == "weak"
    assert legacy_score_result(30).band == "poor"
