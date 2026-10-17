"""Unified score contract (Phase 4.1).

Mirrors `packages/validation/src/score.ts`; every scorer emits this shape so
a stored score can be explained later without re-running matching.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ScoreBand = Literal["strong", "good", "moderate", "weak", "poor"]
ScoreConfidence = Literal["high", "medium", "low"]
ScoreEvidenceTier = Literal["stated", "structural", "inferred"]
ScoreComponentName = Literal[
    "semantic",
    "text",
    "title",
    "skills",
    "recency",
    "seniority",
    "work_mode",
    "application_url",
    "behavior",
]

SCORE_BANDS: tuple[str, ...] = ("strong", "good", "moderate", "weak", "poor")
SCORE_CONFIDENCES: tuple[str, ...] = ("high", "medium", "low")
SCORE_EVIDENCE_TIERS: tuple[str, ...] = ("stated", "structural", "inferred")
SCORE_COMPONENT_NAMES: tuple[str, ...] = (
    "semantic",
    "text",
    "title",
    "skills",
    "recency",
    "seniority",
    "work_mode",
    "application_url",
    "behavior",
)

# Band floors, descending: strong 80, good 60, moderate 40, weak 20.
SCORE_BAND_FLOORS: tuple[tuple[ScoreBand, float], ...] = (
    ("strong", 80.0),
    ("good", 60.0),
    ("moderate", 40.0),
    ("weak", 20.0),
    ("poor", 0.0),
)

_EVIDENCE_RANK: dict[ScoreEvidenceTier, int] = {
    "stated": 0,
    "structural": 1,
    "inferred": 2,
}


class ScoreComponent(BaseModel):
    name: ScoreComponentName
    weight: float = Field(default=0.0, ge=0.0, le=1.0)
    score: float = Field(default=0.0, ge=0.0, le=100.0)
    # Signed points added to the final score; weighted parts hold their share.
    contribution: float = 0.0
    evidence_tier: ScoreEvidenceTier = "inferred"
    reason: str = ""


class ScoreResult(BaseModel):
    score: float = Field(ge=0.0, le=100.0)
    band: ScoreBand
    components: list[ScoreComponent] = Field(default_factory=list)
    confidence: ScoreConfidence
    evidence_tier: ScoreEvidenceTier
    reason: str = ""
    not_evaluated: list[str] = Field(default_factory=list)


def clamp_score(score: float) -> float:
    return max(0.0, min(100.0, float(score)))


def score_band(score: float) -> ScoreBand:
    bounded = clamp_score(score)
    for band, floor in SCORE_BAND_FLOORS:
        if bounded >= floor:
            return band
    return "poor"


def score_component(
    name: ScoreComponentName,
    *,
    weight: float = 0.0,
    score: float = 0.0,
    contribution: float | None = None,
    evidence_tier: ScoreEvidenceTier = "inferred",
    reason: str = "",
) -> ScoreComponent:
    bounded = clamp_score(score)
    points = round(bounded * weight, 1) if contribution is None else contribution
    return ScoreComponent(
        name=name,
        weight=weight,
        score=bounded,
        contribution=round(points, 1),
        evidence_tier=evidence_tier,
        reason=reason,
    )


def worst_evidence_tier(
    components: list[ScoreComponent],
    fallback: ScoreEvidenceTier = "inferred",
) -> ScoreEvidenceTier:
    if not components:
        return fallback
    return max(
        (component.evidence_tier for component in components),
        key=lambda tier: _EVIDENCE_RANK[tier],
    )


def confidence_for(
    evidence_tier: ScoreEvidenceTier,
    not_evaluated: list[str],
) -> ScoreConfidence:
    if evidence_tier == "inferred" or len(not_evaluated) >= 2:
        return "low"
    if evidence_tier == "stated" and not not_evaluated:
        return "high"
    return "medium"


def build_score_result(
    *,
    score: float,
    components: list[ScoreComponent],
    reason: str = "",
    not_evaluated: list[str] | None = None,
) -> ScoreResult:
    missing = list(dict.fromkeys(not_evaluated or []))
    bounded = round(clamp_score(score), 1)
    evidence_tier = worst_evidence_tier(components)
    return ScoreResult(
        score=bounded,
        band=score_band(bounded),
        components=components,
        confidence=confidence_for(evidence_tier, missing),
        evidence_tier=evidence_tier,
        reason=reason,
        not_evaluated=missing,
    )


def not_evaluated_result(
    reason: str,
    missing: list[str],
) -> ScoreResult:
    return build_score_result(
        score=0.0,
        components=[],
        reason=reason,
        not_evaluated=missing,
    )
