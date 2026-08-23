"""Post-filter tailoring suggestions for keyword-safe micro-edits."""

from __future__ import annotations

import re

from models import SuggestionWithId, VariantContent
from services.skills import match_skills_in_text, normalize_skills, skill_key

_BLOCKED_SECTIONS = frozenset({"education", "header", "contact"})
_MAX_LENGTH_RATIO = 1.35
_MIN_TOKEN_OVERLAP = 0.4


def _tokens(text: str) -> set[str]:
    return {
        t.lower()
        for t in re.findall(r"[A-Za-z][A-Za-z0-9+#./-]{1,}", text or "")
        if len(t) >= 2
    }


def _token_overlap(current: str, suggested: str) -> float:
    a = _tokens(current)
    b = _tokens(suggested)
    if not a or not b:
        return 0.0
    return len(a & b) / max(len(a), 1)


def _evidence_corpus(content: VariantContent) -> str:
    parts: list[str] = []
    if content.summary:
        parts.append(content.summary)
    parts.extend(content.skills)
    for role in content.work_history:
        parts.extend(role.highlights or [])
    return " ".join(parts)


def _skills_subset_allowed(
    content: VariantContent,
    suggested_skills: list[str],
) -> bool:
    allowed_keys = {skill_key(s) for s in normalize_skills(content.skills)}
    corpus = _evidence_corpus(content)
    for skill in suggested_skills:
        key = skill_key(skill)
        if key in allowed_keys:
            continue
        if match_skills_in_text([skill], corpus):
            continue
        return False
    return True


def validate_keyword_suggestion(
    suggestion: SuggestionWithId | dict,
    content: VariantContent,
) -> bool:
    section = str(
        suggestion.section if hasattr(suggestion, "section") else suggestion.get("section", "")
    ).lower().strip()
    current = str(
        suggestion.current if hasattr(suggestion, "current") else suggestion.get("current", "")
    ).strip()
    suggested = str(
        suggestion.suggested if hasattr(suggestion, "suggested") else suggestion.get("suggested", "")
    ).strip()
    operation = str(
        suggestion.operation if hasattr(suggestion, "operation") else suggestion.get("operation", "")
    )

    if section in _BLOCKED_SECTIONS:
        return False
    if not suggested:
        return False

    if operation == "reorder_skills" or section in {"skills", "skill"}:
        parts = [p.strip() for p in suggested.replace(";", ",").split(",") if p.strip()]
        if not parts:
            return False
        return _skills_subset_allowed(content, parts)

    if not current or current.lower() == "missing":
        return section in {"skills", "skill"} and operation == "reorder_skills"

    if len(suggested) > len(current) * _MAX_LENGTH_RATIO + 10:
        return False

    overlap = _token_overlap(current, suggested)
    if operation in {"rewrite_existing", "summarize_existing"} and overlap < _MIN_TOKEN_OVERLAP:
        return False

    return True


def filter_keyword_suggestions(
    suggestions: list[SuggestionWithId],
    content: VariantContent,
) -> list[SuggestionWithId]:
    return [s for s in suggestions if validate_keyword_suggestion(s, content)]
