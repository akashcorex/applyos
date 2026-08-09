"""Rank, score, and cap tailoring suggestions."""

from __future__ import annotations

from models import SuggestionWithId, VariantSuggestions

MAX_SUGGESTIONS = 5
SAFE_CONFIDENCE_THRESHOLD = 0.8

_SECTION_RISK: dict[str, str] = {
    "summary": "low",
    "skills": "low",
    "skill": "low",
    "education": "low",
    "header": "low",
    "contact": "low",
    "experience": "medium",
    "work": "medium",
    "work_history": "medium",
}


def infer_risk(section: str, suggested: str) -> str:
    section_l = section.lower().strip()
    if section_l in _SECTION_RISK:
        base = _SECTION_RISK[section_l]
    else:
        base = "medium"

    # New employers or heavy metrics = higher risk
    lower = suggested.lower()
    if any(k in lower for k in ("founded", "acquired", "increased revenue", "%", "x ")):
        return "high"
    if base == "medium" and len(suggested) > 200:
        return "high"
    return base


def infer_confidence(section: str, risk: str, has_job_context: bool) -> float:
    section_l = section.lower().strip()
    score = 0.65
    if section_l in {"summary", "skills", "skill"}:
        score = 0.85
    elif section_l in {"experience", "work", "work_history"}:
        score = 0.7
    if risk == "low":
        score += 0.1
    elif risk == "high":
        score -= 0.25
    if has_job_context:
        score += 0.05
    return max(0.0, min(1.0, round(score, 2)))


def enrich_suggestion(
    item: dict,
    index: int,
    *,
    has_job_context: bool = True,
) -> SuggestionWithId:
    section = str(item.get("section", "summary"))
    suggested = str(item.get("suggested", ""))
    risk = str(item.get("risk", infer_risk(section, suggested)))
    if risk not in {"low", "medium", "high"}:
        risk = infer_risk(section, suggested)
    confidence = float(item.get("confidence", infer_confidence(section, risk, has_job_context)))
    confidence = max(0.0, min(1.0, confidence))

    return SuggestionWithId(
        id=f"s{index}",
        section=section,
        current=str(item.get("current", "")),
        suggested=suggested,
        reason=str(item.get("reason", "")),
        confidence=confidence,
        risk=risk,  # type: ignore[arg-type]
    )


def rank_and_cap(suggestions: VariantSuggestions) -> VariantSuggestions:
    ranked = sorted(
        suggestions.suggestions,
        key=lambda s: (s.confidence, -{"high": 0, "medium": 1, "low": 2}[s.risk]),
        reverse=True,
    )
    return VariantSuggestions(
        suggestions=ranked[:MAX_SUGGESTIONS],
        overall_assessment=suggestions.overall_assessment,
    )


def safe_suggestion_ids(suggestions: list[SuggestionWithId]) -> list[str]:
    return [
        s.id
        for s in suggestions
        if s.confidence >= SAFE_CONFIDENCE_THRESHOLD and s.risk == "low"
    ]
