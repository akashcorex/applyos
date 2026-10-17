"""Cross-language drift guard for the unified score contract (Phase 4.1).

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
    SCORE_EVIDENCE_TIERS,
    ScoreBand,
    ScoreComponent,
    ScoreComponentName,
    ScoreConfidence,
    ScoreEvidenceTier,
    ScoreResult,
    build_score_result,
    not_evaluated_result,
    score_band,
    score_component,
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

    component_schema = schema["properties"]["components"]["items"]
    assert set(component_schema["properties"]) == set(
        ScoreComponent.model_fields
    )
    assert set(component_schema["required"]) == set(ScoreComponent.model_fields)


def test_python_literal_values_match_typescript_enums() -> None:
    schema = _score_schema()
    properties = schema["properties"]
    component_schema = properties["components"]["items"]["properties"]

    assert list(get_args(ScoreBand)) == properties["band"]["enum"]
    assert list(get_args(ScoreConfidence)) == properties["confidence"]["enum"]
    assert list(get_args(ScoreEvidenceTier)) == properties["evidence_tier"]["enum"]
    assert (
        list(get_args(ScoreComponentName))
        == component_schema["name"]["enum"]
    )
    assert (
        properties["evidence_tier"]["enum"]
        == component_schema["evidence_tier"]["enum"]
    )


def test_all_agent_contracts_agree() -> None:
    modules = [
        _load_contract_module("job-agent", "job_agent_score_contract"),
        _load_contract_module("resume-agent", "resume_agent_score_contract"),
        _load_contract_module("ai-orchestrator", "ai_orchestrator_score_contract"),
    ]
    for module in modules:
        assert module.SCORE_BANDS == SCORE_BANDS
        assert module.SCORE_CONFIDENCES == SCORE_CONFIDENCES
        assert module.SCORE_EVIDENCE_TIERS == SCORE_EVIDENCE_TIERS
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


def test_confidence_tiers_derive_from_evidence() -> None:
    stated = build_score_result(
        score=88,
        components=[
            score_component(
                "skills",
                weight=1.0,
                score=88,
                evidence_tier="stated",
                reason="JD quotes the skill.",
            )
        ],
        reason="All material inputs present.",
    )
    assert stated.confidence == "high"
    assert stated.band == "strong"
    assert stated.evidence_tier == "stated"

    structural = build_score_result(
        score=62,
        components=[
            score_component("title", weight=1.0, score=62, evidence_tier="structural")
        ],
    )
    assert structural.confidence == "medium"

    inferred = build_score_result(
        score=30,
        components=[
            score_component("semantic", weight=1.0, score=30, evidence_tier="inferred")
        ],
    )
    assert inferred.confidence == "low"
    assert inferred.evidence_tier == "inferred"


def test_unscored_result_states_what_is_missing() -> None:
    result = not_evaluated_result(
        "Semantic scoring unavailable.",
        ["semantic", "text", "title"],
    )
    assert result.score == 0.0
    assert result.confidence == "low"
    assert result.not_evaluated == ["semantic", "text", "title"]
    assert result.components == []
