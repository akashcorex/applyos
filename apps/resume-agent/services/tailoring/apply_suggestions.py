"""Apply accepted improvement suggestions to variant content."""

from __future__ import annotations

import re

from models import SuggestionWithId, VariantContent


def apply_suggestions(
    content: VariantContent,
    suggestions: list[SuggestionWithId],
    accepted_ids: list[str],
    *,
    keyword_mode: bool = True,
) -> VariantContent:
    if not accepted_ids:
        return content

    accepted = {s.id: s for s in suggestions if s.id in accepted_ids}
    if not accepted:
        return content

    updated = content.model_copy(deep=True)

    for suggestion in accepted.values():
        section = suggestion.section.lower().strip()
        suggested = suggestion.suggested.strip()
        operation = suggestion.operation

        if section in {"summary", "profile"}:
            updated.summary = _apply_summary(
                updated.summary,
                suggestion.current,
                suggested,
                operation=operation,
            )
        elif section in {"skills", "skill"}:
            if operation == "reorder_skills":
                updated.skills = _parse_skill_order(suggested, updated.skills)
            else:
                updated.skills = _merge_skills(updated.skills, suggested)
        elif section in {"header", "contact"}:
            _apply_header(updated, suggested)
        elif section in {"experience", "work", "work_history"}:
            if suggested:
                _apply_experience(
                    updated,
                    suggestion.current,
                    suggested,
                    keyword_mode=keyword_mode,
                )
            elif operation == "select":
                _remove_experience_bullet(updated, suggestion.current)

    return updated


def _apply_summary(
    summary: str | None,
    current: str,
    suggested: str,
    *,
    operation: str,
) -> str:
    if not suggested:
        return summary or ""
    if not summary or not current.strip() or current.lower() == "missing":
        return suggested
    if operation == "summarize_existing" and current.strip() in (summary or ""):
        return summary.replace(current.strip(), suggested, 1)
    # Phrase-level: replace longest overlapping span
    current_norm = current.strip()
    if current_norm and current_norm in summary:
        return summary.replace(current_norm, suggested, 1)
    overlap = _longest_common_substring(current_norm, summary or "")
    if overlap and len(overlap) >= 8:
        return (summary or "").replace(overlap, suggested, 1)
    return suggested


def _longest_common_substring(a: str, b: str) -> str:
    if not a or not b:
        return ""
    a_lower, b_lower = a.lower(), b.lower()
    best = ""
    for i in range(len(a_lower)):
        for j in range(i + 1, len(a_lower) + 1):
            fragment = a_lower[i:j]
            if len(fragment) > len(best) and fragment in b_lower:
                best = a[i:j]
    return best


def _parse_skill_order(suggested: str, existing: list[str]) -> list[str]:
    parts = [p.strip() for p in suggested.replace(";", ",").split(",") if p.strip()]
    if not parts:
        return existing
    existing_lower = {s.lower(): s for s in existing}
    ordered: list[str] = []
    seen: set[str] = set()
    for part in parts:
        key = part.lower()
        if key in existing_lower and key not in seen:
            ordered.append(existing_lower[key])
            seen.add(key)
    for skill in existing:
        if skill.lower() not in seen:
            ordered.append(skill)
    return ordered


def _merge_skills(existing: list[str], suggested: str) -> list[str]:
    return _parse_skill_order(suggested, existing) if "," in suggested or ";" in suggested else _merge_skills_add(existing, suggested)


def _merge_skills_add(existing: list[str], suggested: str) -> list[str]:
    parts = [p.strip() for p in suggested.replace(";", ",").split(",") if p.strip()]
    merged = list(existing)
    seen = {s.lower() for s in merged}
    for skill in parts:
        if skill.lower() not in seen:
            merged.append(skill)
            seen.add(skill.lower())
    return merged


def _apply_header(content: VariantContent, suggested: str) -> None:
    for line in suggested.split("\n"):
        lower = line.lower()
        if "@" in line and not content.email:
            content.email = line.strip()
        elif any(k in lower for k in ("phone", "tel:", "+")):
            content.phone = line.strip()
        elif not content.location and len(line) < 80:
            content.location = line.strip()


def _apply_experience(
    content: VariantContent,
    current: str,
    suggested: str,
    *,
    keyword_mode: bool,
) -> None:
    if not content.work_history:
        return

    current_norm = current.strip().lower()
    for role in content.work_history:
        if current_norm and current_norm != "missing":
            for i, bullet in enumerate(role.highlights or []):
                if current_norm in bullet.lower() or bullet.lower() in current_norm:
                    highlights = list(role.highlights or [])
                    highlights[i] = suggested
                    role.highlights = highlights
                    return
            haystack = " ".join(role.highlights).lower()
            if current_norm[:40] in haystack or current_norm in role.title.lower():
                role.highlights = _replace_or_append_bullet(
                    role.highlights or [], current_norm, suggested
                )
                return

    if keyword_mode:
        return

    content.work_history[0].highlights = [suggested] + list(
        content.work_history[0].highlights or []
    )


def _remove_experience_bullet(content: VariantContent, current: str) -> None:
    current_norm = current.strip().lower()
    if not current_norm:
        return
    for role in content.work_history:
        role.highlights = [
            b for b in (role.highlights or []) if current_norm not in b.lower()
        ]


def _replace_or_append_bullet(
    highlights: list[str],
    current_norm: str,
    suggested: str,
) -> list[str]:
    for i, bullet in enumerate(highlights):
        if current_norm in bullet.lower():
            updated = list(highlights)
            updated[i] = suggested
            return updated
    return [suggested, *highlights]
