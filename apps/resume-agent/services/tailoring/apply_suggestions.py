"""Apply accepted improvement suggestions to variant content."""

from __future__ import annotations

from models import SuggestionWithId, VariantContent


def apply_suggestions(
    content: VariantContent,
    suggestions: list[SuggestionWithId],
    accepted_ids: list[str],
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
        if not suggested:
            continue

        if section in {"summary", "profile"}:
            updated.summary = suggested
        elif section in {"skills", "skill"}:
            updated.skills = _merge_skills(updated.skills, suggested)
        elif section in {"header", "contact"}:
            _apply_header(updated, suggested)
        elif section in {"experience", "work", "work_history"}:
            _apply_experience(updated, suggestion.current, suggested)
        elif section == "education":
            if updated.education:
                updated.education[0].degree = suggested
            else:
                from models import Education

                updated.education.append(Education(degree=suggested, school=""))

    return updated


def _merge_skills(existing: list[str], suggested: str) -> list[str]:
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
) -> None:
    if not content.work_history:
        return

    current_norm = current.strip().lower()
    for role in content.work_history:
        if current_norm and current_norm != "missing":
            haystack = " ".join(role.highlights).lower()
            if current_norm[:40] in haystack or current_norm in role.title.lower():
                role.highlights = _replace_or_append_bullet(
                    role.highlights, current_norm, suggested
                )
                return

    # Default: prepend bullet to most recent role.
    content.work_history[0].highlights = [suggested] + list(
        content.work_history[0].highlights
    )


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
