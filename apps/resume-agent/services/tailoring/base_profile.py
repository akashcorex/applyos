"""Persistent base profile between immutable master and job variants."""

from __future__ import annotations

from models import ResumeRecord, VariantContent


def record_to_base_profile(record: ResumeRecord) -> VariantContent:
    return VariantContent(
        full_name=record.full_name,
        email=record.email,
        phone=record.phone,
        location=record.location,
        summary=record.summary,
        experience_years=record.experience_years,
        skills=list(record.skills),
        education=list(record.education),
        work_history=list(record.work_history),
        preferred_role=record.preferred_role,
    )


def parse_base_profile(raw: object | None, master: ResumeRecord) -> VariantContent:
    if raw is None:
        return record_to_base_profile(master)
    if isinstance(raw, dict):
        return VariantContent.model_validate(raw)
    return record_to_base_profile(master)


def merge_variant_into_base(
    base: VariantContent,
    variant: VariantContent,
) -> VariantContent:
    """Promote durable improvements from a finalized variant into base profile."""
    merged = base.model_copy(deep=True)

    if variant.summary and variant.summary.strip():
        merged.summary = variant.summary

    if variant.skills:
        seen = {s.lower() for s in merged.skills}
        for skill in variant.skills:
            if skill.lower() not in seen:
                merged.skills.append(skill)
                seen.add(skill.lower())

    if variant.work_history:
        by_company = {
            (r.company.strip().lower(), r.title.strip().lower()): r
            for r in merged.work_history
        }
        for role in variant.work_history:
            key = (role.company.strip().lower(), role.title.strip().lower())
            if key in by_company and role.highlights:
                by_company[key].highlights = list(role.highlights)
            elif role.highlights:
                merged.work_history.append(role)

    if variant.preferred_role:
        merged.preferred_role = variant.preferred_role

    return merged
