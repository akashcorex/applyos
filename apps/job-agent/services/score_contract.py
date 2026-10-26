"""Unified score contract (Phase 4.2).

Mirrors `packages/validation/src/score.ts`; every scorer emits this shape so
a stored decision can be explained later without re-running matching.

The decision is authoritative. The 0-100 `score` is a storage/display
projection of `rating`, never a decision input.

Decision rules (never a weighted sum):
  - a failed hard gate, or any critical dimension below 3, means SKIP;
  - an unknown critical or high dimension means MAYBE;
  - all critical >= 4 with a mean rating >= 3.5 means APPLY;
  - anything else means MAYBE.

`low` dimensions (behaviour, application_url) never decide: they are excluded
from the mean and cannot veto, flip or name an interview risk.
"""

from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field

ScoreBand = Literal["strong", "good", "moderate", "weak", "poor"]
ScoreDecision = Literal["apply", "maybe", "skip"]
ScoreConfidence = Literal["high", "medium", "low"]
ScoreEvidenceTier = Literal["stated", "structural", "inferred"]
ScoreImportance = Literal["critical", "high", "medium", "low"]
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
SCORE_DECISIONS: tuple[str, ...] = ("apply", "maybe", "skip")
SCORE_CONFIDENCES: tuple[str, ...] = ("high", "medium", "low")
SCORE_EVIDENCE_TIERS: tuple[str, ...] = ("stated", "structural", "inferred")
SCORE_IMPORTANCES: tuple[str, ...] = ("critical", "high", "medium", "low")
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

DEFAULT_IMPORTANCE: dict[str, ScoreImportance] = {
    "semantic": "critical",
    "text": "critical",
    "title": "medium",
    "skills": "critical",
    "recency": "medium",
    "seniority": "high",
    "work_mode": "medium",
    "application_url": "medium",
    "behavior": "medium",
}

# Band floors for bare 0-100 numbers (legacy rows and charts only).
SCORE_BAND_FLOORS: tuple[tuple[ScoreBand, float], ...] = (
    ("strong", 80.0),
    ("good", 60.0),
    ("moderate", 40.0),
    ("weak", 20.0),
    ("poor", 0.0),
)

RATING_ANCHORS: tuple[tuple[float, int], ...] = (
    (0.85, 5),
    (0.70, 4),
    (0.55, 3),
    (0.40, 2),
)

_EVIDENCE_RANK: dict[ScoreEvidenceTier, int] = {
    "stated": 0,
    "structural": 1,
    "inferred": 2,
}


class ScoreDimension(BaseModel):
    name: ScoreComponentName
    # None means unknown: the evidence cannot support a judgment.
    rating: float | None = Field(default=None, ge=1.0, le=5.0)
    importance: ScoreImportance = "medium"
    evidence_tier: ScoreEvidenceTier = "inferred"
    reason: str = ""
    # True when the evidence gate forced a rating back to unknown.
    downgraded: bool = False


class ScoreGate(BaseModel):
    name: str
    passed: bool
    reason: str = ""


class ScoreResult(BaseModel):
    decision: ScoreDecision
    band: ScoreBand
    rating: float | None = Field(default=None, ge=1.0, le=5.0)
    score: float = Field(ge=0.0, le=100.0)
    dimensions: list[ScoreDimension] = Field(default_factory=list)
    gates: list[ScoreGate] = Field(default_factory=list)
    confidence: ScoreConfidence
    evidence_tier: ScoreEvidenceTier
    reason: str = ""
    not_evaluated: list[str] = Field(default_factory=list)
    interview_risk: list[str] = Field(default_factory=list)


def clamp_score(score: float) -> float:
    return max(0.0, min(100.0, float(score)))


def rating_from_similarity(value: float) -> int:
    """Map a 0-1 similarity or coverage ratio onto a 1-5 anchor."""
    bounded = max(0.0, min(1.0, float(value)))
    for floor, rating in RATING_ANCHORS:
        if bounded >= floor:
            return rating
    return 1


def score_from_rating(rating: float | None) -> float:
    """Mean rating -> comparable number for ordering and display only."""
    if rating is None:
        return 0.0
    return float(round(max(1.0, min(5.0, rating)) * 20))


def rating_from_score(score: float) -> float:
    """Inverse of `score_from_rating`, for rows stored before this contract."""
    return max(1.0, min(5.0, float(score) / 20.0))


def score_band(score: float) -> ScoreBand:
    bounded = clamp_score(score)
    for band, floor in SCORE_BAND_FLOORS:
        if bounded >= floor:
            return band
    return "poor"


def band_for_decision(
    decision: ScoreDecision,
    rating: float | None,
) -> ScoreBand:
    """Display band, capped by the decision."""
    mean = rating or 0.0
    if decision == "apply":
        return "strong" if mean >= 4.5 else "good"
    if decision == "maybe":
        return "moderate"
    return "weak" if mean >= 3.0 else "poor"


def score_dimension(
    name: ScoreComponentName,
    *,
    rating: float | None,
    evidence_tier: ScoreEvidenceTier,
    importance: ScoreImportance | None = None,
    reason: str = "",
) -> ScoreDimension:
    """Build a dimension; the tier is required so it is never assumed."""
    return ScoreDimension(
        name=name,
        rating=None if rating is None else max(1.0, min(5.0, float(rating))),
        importance=importance or DEFAULT_IMPORTANCE[name],
        evidence_tier=evidence_tier,
        reason=reason,
    )


def apply_evidence_gate(
    dimensions: list[ScoreDimension],
) -> list[ScoreDimension]:
    """An inferred rating may not drive a critical or high dimension."""
    gated: list[ScoreDimension] = []
    for dimension in dimensions:
        drives = dimension.importance in ("critical", "high")
        if not drives or dimension.evidence_tier != "inferred":
            gated.append(dimension)
            continue
        if dimension.rating is None:
            gated.append(dimension)
            continue
        suffix = (
            f" [evidence gate: inferred cannot drive {dimension.importance}]"
        )
        gated.append(
            dimension.model_copy(
                update={
                    "rating": None,
                    "downgraded": True,
                    "reason": f"{dimension.reason}{suffix}".strip(),
                }
            )
        )
    return gated


def _round_half_up(value: float, places: int) -> float:
    """Match JavaScript's `Math.round` so both contracts agree on a rating."""
    factor = 10**places
    return math.floor(value * factor + 0.5) / factor


def mean_rating(dimensions: list[ScoreDimension]) -> float | None:
    """Mean of the rated dimensions allowed to move a decision.

    `low` dimensions are explanation and ordering context, so they are
    excluded: a ranking signal must not cross the apply line.
    """
    rated = [
        dimension.rating
        for dimension in dimensions
        if dimension.importance != "low" and dimension.rating is not None
    ]
    if not rated:
        return None
    return _round_half_up(sum(rated) / len(rated), 1)


def decide_for_dimensions(
    dimensions: list[ScoreDimension],
    gates: list[ScoreGate] | None = None,
) -> ScoreDecision:
    if any(not gate.passed for gate in (gates or [])):
        return "skip"
    if not dimensions:
        return "skip"
    considered = [d for d in dimensions if d.importance != "low"]
    if not any(dimension.rating is not None for dimension in considered):
        # Nothing rated is not a rejection: it is an unevaluated posting.
        return "maybe"

    critical = [d for d in considered if d.importance == "critical"]
    if any(
        d.rating is not None and d.rating < 3 for d in critical
    ):
        return "skip"
    if any(
        d.importance in ("critical", "high") and d.rating is None
        for d in considered
    ):
        return "maybe"
    # `all([])` is True, so require an actual critical judgment before applying.
    if not critical:
        return "maybe"
    critical_strong = all(
        (d.rating or 0) >= 4 for d in critical
    )
    mean = mean_rating(dimensions) or 0.0
    if critical_strong and mean >= 3.5:
        return "apply"
    return "maybe"


def confidence_for_dimensions(
    dimensions: list[ScoreDimension],
) -> ScoreConfidence:
    unknown = sum(1 for d in dimensions if d.rating is None)
    if unknown >= 2:
        return "low"
    if unknown == 1:
        return "medium"
    return "high"


def worst_evidence_tier(
    dimensions: list[ScoreDimension],
    fallback: ScoreEvidenceTier = "inferred",
) -> ScoreEvidenceTier:
    if not dimensions:
        return fallback
    worst: ScoreEvidenceTier = "stated"
    for dimension in dimensions:
        if _EVIDENCE_RANK[dimension.evidence_tier] > _EVIDENCE_RANK[worst]:
            worst = dimension.evidence_tier
    return worst


def interview_risks_for(
    decision: ScoreDecision,
    dimensions: list[ScoreDimension],
) -> list[str]:
    """Only an APPLY with a weak *decision-driving* dimension is interview risk."""
    if decision != "apply":
        return []
    risks: list[str] = []
    for dimension in dimensions:
        if dimension.rating is None or dimension.rating > 3:
            continue
        if dimension.importance not in ("critical", "high"):
            continue
        gap = dimension.reason or "the gap above"
        risks.append(
            f"{dimension.name} ({dimension.rating:g}/5): expect questions on {gap}"
        )
    return risks


def build_score_result(
    *,
    dimensions: list[ScoreDimension],
    gates: list[ScoreGate] | None = None,
    reason: str = "",
) -> ScoreResult:
    """Apply the evidence gate, then derive every other field."""
    gated = apply_evidence_gate(list(dimensions))
    gate_list = list(gates or [])
    decision = decide_for_dimensions(gated, gate_list)
    rating = mean_rating(gated)
    unknown = [d.name for d in gated if d.rating is None]
    return ScoreResult(
        decision=decision,
        band=band_for_decision(decision, rating),
        rating=rating,
        score=score_from_rating(rating),
        dimensions=gated,
        gates=gate_list,
        confidence=confidence_for_dimensions(gated),
        evidence_tier=worst_evidence_tier(gated),
        reason=reason,
        not_evaluated=unknown,
        interview_risk=interview_risks_for(decision, gated),
    )


def legacy_score_result(
    score: float,
    reason: str = "Legacy score: component breakdown was not stored.",
) -> ScoreResult:
    bounded = clamp_score(score)
    rating = _round_half_up(rating_from_score(bounded), 1)
    if rating >= 4.0:
        decision: ScoreDecision = "apply"
    elif rating >= 3.5:
        decision = "maybe"
    else:
        decision = "skip"
    return ScoreResult(
        decision=decision,
        # Capped by the derived decision, so an old row cannot display a band
        # the decision would not support.
        band=band_for_decision(decision, rating),
        rating=rating,
        score=bounded,
        dimensions=[],
        gates=[],
        confidence="low",
        evidence_tier="inferred",
        reason=reason,
        not_evaluated=["dimensions"],
        interview_risk=[],
    )


def not_evaluated_result(
    reason: str,
    missing: list[str],
) -> ScoreResult:
    return ScoreResult(
        decision="skip",
        band="poor",
        rating=None,
        score=0.0,
        dimensions=[],
        gates=[],
        confidence="low",
        evidence_tier="inferred",
        reason=reason,
        not_evaluated=list(dict.fromkeys(missing)),
        interview_risk=[],
    )
