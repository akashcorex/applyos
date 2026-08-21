"""Canonical Resume IR, provenance, patch validation, and diff helpers."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from models import (
    DiffContract,
    DiffEntry,
    EvidenceRef,
    EvidenceSpan,
    JobProfile,
    IRBullet,
    IREducation,
    IRIdentity,
    IRSkill,
    IRWorkExperience,
    ResumeIR,
    ResumeRecord,
    TailoringOperation,
    TailoringPatch,
    TailoringPolicy,
    VariantContent,
)

_NUMBER_RE = re.compile(
    r"(?<![\w])(?:\d+(?:\.\d+)?(?:%|[KMB])?|\$\d+(?:\.\d+)?[KMB]?)",
    re.I,
)
_DATE_RE = re.compile(
    r"\b(?:19|20)\d{2}(?:[-/](?:0?[1-9]|1[0-2]))?\b|\b(?:present|current)\b",
    re.I,
)


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def sha256_bytes(raw_bytes: bytes) -> str:
    return hashlib.sha256(raw_bytes).hexdigest()


def sha256_json(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip().lower())


def _stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256(
        "\x1f".join(_normalise(part) for part in parts).encode("utf-8")
    ).hexdigest()[:16]
    return f"{prefix}_{digest}"


def _find_excerpt(raw_text: str | None, value: str) -> tuple[int | None, int | None]:
    if not raw_text or not value:
        return None, None
    start = raw_text.lower().find(value.lower())
    if start < 0:
        return None, None
    return start, start + len(value)


def _evidence(
    *,
    evidence: dict[str, EvidenceRef],
    evidence_id: str,
    source_hash: str,
    raw_text: str | None,
    excerpt: str,
    kind: str = "assertion",
) -> None:
    start, end = _find_excerpt(raw_text, excerpt)
    evidence[evidence_id] = EvidenceRef(
        id=evidence_id,
        kind=kind,  # type: ignore[arg-type]
        spans=[
            EvidenceSpan(
                source_document_hash=source_hash,
                start=start,
                end=end,
                excerpt=excerpt[:500],
            )
        ],
    )


def record_to_ir(
    record: ResumeRecord,
    *,
    source_document_hash: str,
    resume_id: str | None = None,
    source_document_id: str | None = None,
    source_segments: Any | None = None,
) -> ResumeIR:
    """Project the legacy record into the canonical IR exactly once."""

    evidence: dict[str, EvidenceRef] = {}
    raw_text = record.raw_text
    identity = IRIdentity(
        full_name=record.full_name,
        email=record.email,
        phone=record.phone,
        location=record.location,
    )

    identity_evidence: dict[str, list[str]] = {}
    for field, value in (
        ("full_name", record.full_name),
        ("email", record.email),
        ("phone", record.phone),
        ("location", record.location),
    ):
        if value:
            evidence_id = _stable_id("ev", field, value)
            _evidence(
                evidence=evidence,
                evidence_id=evidence_id,
                source_hash=source_document_hash,
                raw_text=raw_text,
                excerpt=value,
            )
            identity_evidence[field] = [evidence_id]

    skills: list[IRSkill] = []
    for index, skill in enumerate(record.skills):
        name = skill.strip()
        if not name:
            continue
        skill_id = _stable_id("skill", str(index), name)
        evidence_id = _stable_id("ev", skill_id, name)
        _evidence(
            evidence=evidence,
            evidence_id=evidence_id,
            source_hash=source_document_hash,
            raw_text=raw_text,
            excerpt=name,
        )
        skills.append(
            IRSkill(
                id=skill_id,
                name=name,
                normalized_name=_normalise(name),
                evidence_ids=[evidence_id],
            )
        )

    experience: list[IRWorkExperience] = []
    for role_index, role in enumerate(record.work_history):
        role_id = _stable_id(
            "exp",
            str(role_index),
            role.company,
            role.title,
            role.start_date or "",
        )
        role_evidence_id = _stable_id("ev", role_id, role.company, role.title)
        _evidence(
            evidence=evidence,
            evidence_id=role_evidence_id,
            source_hash=source_document_hash,
            raw_text=raw_text,
            excerpt=f"{role.title} {role.company}",
        )
        bullets: list[IRBullet] = []
        for bullet_index, text in enumerate(role.highlights):
            bullet_text = text.strip()
            if not bullet_text:
                continue
            bullet_id = _stable_id("bullet", role_id, str(bullet_index), bullet_text)
            evidence_id = _stable_id("ev", bullet_id, bullet_text)
            _evidence(
                evidence=evidence,
                evidence_id=evidence_id,
                source_hash=source_document_hash,
                raw_text=raw_text,
                excerpt=bullet_text,
            )
            bullets.append(
                IRBullet(
                    id=bullet_id,
                    text=bullet_text,
                    evidence_ids=[evidence_id],
                    metrics=_NUMBER_RE.findall(bullet_text),
                    skill_names=[
                        skill.name
                        for skill in skills
                        if _normalise(skill.name) in _normalise(bullet_text)
                    ],
                )
            )
        experience.append(
            IRWorkExperience(
                id=role_id,
                company=role.company,
                title=role.title,
                start_date=role.start_date,
                end_date=role.end_date,
                bullets=bullets,
                evidence_ids=[role_evidence_id],
            )
        )

    education: list[IREducation] = []
    for index, item in enumerate(record.education):
        education_id = _stable_id("edu", str(index), item.school, item.degree)
        evidence_id = _stable_id("ev", education_id, item.school, item.degree)
        _evidence(
            evidence=evidence,
            evidence_id=evidence_id,
            source_hash=source_document_hash,
            raw_text=raw_text,
            excerpt=f"{item.degree} {item.school}",
        )
        education.append(
            IREducation(
                id=education_id,
                degree=item.degree,
                school=item.school,
                year=item.year,
                evidence_ids=[evidence_id],
            )
        )

    if record.summary:
        summary_id = _stable_id("ev", "summary", record.summary)
        _evidence(
            evidence=evidence,
            evidence_id=summary_id,
            source_hash=source_document_hash,
            raw_text=raw_text,
            excerpt=record.summary,
        )

    if source_segments:
        for reference in evidence.values():
            for index, span in enumerate(reference.spans):
                for segment in source_segments:
                    position = segment.text.lower().find(span.excerpt.lower())
                    if position < 0:
                        continue
                    start = (segment.start or 0) + position
                    end = start + len(span.excerpt)
                    reference.spans[index] = span.model_copy(
                        update={
                            "page": segment.page,
                            "start": start,
                            "end": end,
                        }
                    )
                    break

    return ResumeIR(
        resume_id=resume_id,
        user_id=record.user_id,
        source_document_id=source_document_id,
        source_document_hash=source_document_hash,
        identity=identity,
        summary=record.summary,
        experience_years=record.experience_years,
        skills=skills,
        education=education,
        experience=experience,
        preferred_role=record.preferred_role,
        preferred_locations=record.preferred_locations,
        evidence=evidence,
        metadata={
            "legacy_record_fields": list(identity_evidence),
            "extraction_schema_version": "resume-extraction.v1",
        },
    )


def ir_hash(ir: ResumeIR) -> str:
    payload = ir.model_dump(mode="json", exclude={"resume_id"})
    return sha256_json(payload)


def ir_to_variant_content(ir: ResumeIR) -> VariantContent:
    from models import Education, WorkHistory

    return VariantContent(
        full_name=ir.identity.full_name,
        email=ir.identity.email,
        phone=ir.identity.phone,
        location=ir.identity.location,
        summary=ir.summary,
        experience_years=ir.experience_years,
        skills=[skill.name for skill in ir.skills],
        education=[
            Education(degree=item.degree, school=item.school, year=item.year)
            for item in ir.education
        ],
        work_history=[
            WorkHistory(
                company=role.company,
                title=role.title,
                start_date=role.start_date,
                end_date=role.end_date,
                highlights=[bullet.text for bullet in role.bullets],
            )
            for role in ir.experience
        ],
        preferred_role=ir.preferred_role,
    )


def ir_to_record(ir: ResumeIR, *, template: ResumeRecord | None = None) -> ResumeRecord:
    """Project the current IR into the legacy matcher DTO at one boundary."""

    content = ir_to_variant_content(ir)
    return ResumeRecord(
        user_id=ir.user_id,
        full_name=content.full_name,
        email=content.email,
        phone=content.phone,
        location=content.location,
        summary=content.summary,
        experience_years=content.experience_years,
        skills=content.skills,
        education=content.education,
        work_history=content.work_history,
        preferred_role=content.preferred_role,
        preferred_locations=ir.preferred_locations,
        raw_text=template.raw_text if template else None,
        file_name=template.file_name if template else None,
        file_type=template.file_type if template else None,
        file_path=template.file_path if template else None,
        profile_embedding=template.profile_embedding if template else None,
        profile_text_hash=template.profile_text_hash if template else None,
        last_match_intent=template.last_match_intent if template else None,
    )


def _numbers(value: str) -> set[str]:
    return {item.lower() for item in _NUMBER_RE.findall(value)}


def _dates(value: str) -> set[str]:
    return {item.lower() for item in _DATE_RE.findall(value)}


def _validate_rewrite(before: str, after: str) -> list[str]:
    errors: list[str] = []
    if not after.strip():
        return ["A rewritten value cannot be empty"]
    if not _numbers(after).issuperset(_numbers(before)):
        errors.append("A rewrite cannot remove or change existing metrics")
    if not _dates(after).issuperset(_dates(before)):
        errors.append("A rewrite cannot remove or change existing dates")
    return errors


def build_patch(
    *,
    ir: ResumeIR,
    target: VariantContent,
    source_revision_id: str,
    job_profile: JobProfile,
    policy: TailoringPolicy | None = None,
) -> tuple[TailoringPatch, DiffContract]:
    """Build and validate a patch from legacy editor content to IR content."""

    policy = policy or TailoringPolicy()
    base = ir_to_variant_content(ir)
    operations: list[TailoringOperation] = []
    semantic: list[DiffEntry] = []

    immutable_pairs = (
        ("identity.full_name", base.full_name, target.full_name),
        ("identity.email", base.email, target.email),
        ("identity.phone", base.phone or "", target.phone or ""),
        ("identity.location", base.location or "", target.location or ""),
    )
    for field, before, after in immutable_pairs:
        if before != after:
            raise ValueError(f"Tailoring policy forbids changing {field}")

    if base.summary != target.summary:
        errors = _validate_rewrite(base.summary or "", target.summary or "")
        if errors:
            raise ValueError("; ".join(errors))
        summary_node = _stable_id("summary", ir.summary or "")
        operation = TailoringOperation(
            operation="summarize_existing",
            node_id=summary_node,
            field="summary",
            before=base.summary,
            after=target.summary,
            evidence_ids=[
                evidence_id
                for evidence_id, ref in ir.evidence.items()
                if ref.spans and ref.spans[0].excerpt == (base.summary or "")
            ],
        )
        operations.append(operation)
        semantic.append(
            DiffEntry(
                node_id=summary_node,
                field="summary",
                before=base.summary,
                after=target.summary,
                evidence_ids=operation.evidence_ids,
                reason="Reframed existing summary for the target job",
            )
        )

    base_skill_names = {_normalise(skill) for skill in base.skills}
    target_skill_names = {_normalise(skill) for skill in target.skills}
    if not target_skill_names.issubset(base_skill_names):
        added = sorted(target_skill_names - base_skill_names)
        raise ValueError(f"Tailoring policy forbids unsupported skills: {', '.join(added)}")
    if base.skills != target.skills:
        operation = TailoringOperation(
            operation="reorder_skills",
            node_id="skills",
            field="skills",
            before=base.skills,
            after=target.skills,
            evidence_ids=[
                evidence_id
                for skill in ir.skills
                for evidence_id in skill.evidence_ids
            ],
            rationale="Prioritize evidence-backed skills for the target job",
        )
        operations.append(operation)
        semantic.append(
            DiffEntry(
                node_id="skills",
                field="skills",
                before=base.skills,
                after=target.skills,
                evidence_ids=operation.evidence_ids,
                reason="Reordered or selected existing skills",
            )
        )

    if len(target.work_history) != len(base.work_history):
        raise ValueError("Tailoring policy forbids adding or removing employers")

    for role_index, (base_role, target_role, ir_role) in enumerate(
        zip(base.work_history, target.work_history, ir.experience)
    ):
        for field in ("company", "title", "start_date", "end_date"):
            if getattr(base_role, field) != getattr(target_role, field):
                raise ValueError(f"Tailoring policy forbids changing work history {field}")
        if len(target_role.highlights) > len(base_role.highlights):
            raise ValueError("Tailoring policy forbids adding unsupported bullets")
        for bullet_index, (before, after) in enumerate(
            zip(base_role.highlights, target_role.highlights)
        ):
            if before == after:
                continue
            errors = _validate_rewrite(before, after)
            if errors:
                raise ValueError("; ".join(errors))
            bullet = (
                ir_role.bullets[bullet_index]
                if bullet_index < len(ir_role.bullets)
                else None
            )
            node_id = bullet.id if bullet else f"experience_{role_index}_{bullet_index}"
            evidence_ids = bullet.evidence_ids if bullet else []
            operation = TailoringOperation(
                operation="rewrite_existing",
                node_id=node_id,
                field=f"experience[{role_index}].bullets[{bullet_index}]",
                before=before,
                after=after,
                evidence_ids=evidence_ids,
                rationale="Rephrased an existing evidence-backed accomplishment",
            )
            operations.append(operation)
            semantic.append(
                DiffEntry(
                    node_id=node_id,
                    field=operation.field,
                    before=before,
                    after=after,
                    evidence_ids=evidence_ids,
                    reason=operation.rationale,
                )
            )
        for bullet_index in range(
            len(target_role.highlights), len(base_role.highlights)
        ):
            bullet = (
                ir_role.bullets[bullet_index]
                if bullet_index < len(ir_role.bullets)
                else None
            )
            node_id = bullet.id if bullet else f"experience_{role_index}_{bullet_index}"
            evidence_ids = bullet.evidence_ids if bullet else []
            operation = TailoringOperation(
                operation="select",
                node_id=node_id,
                field=f"experience[{role_index}].bullets[{bullet_index}]",
                before=base_role.highlights[bullet_index],
                after=None,
                evidence_ids=evidence_ids,
                rationale="Selected the most relevant existing accomplishments",
            )
            operations.append(operation)
            semantic.append(
                DiffEntry(
                    node_id=node_id,
                    field=operation.field,
                    before=base_role.highlights[bullet_index],
                    after=None,
                    evidence_ids=evidence_ids,
                    reason=operation.rationale,
                )
            )

    if base.education != target.education:
        raise ValueError("Tailoring policy forbids changing education")

    patch = TailoringPatch(
        source_revision_id=source_revision_id,
        source_ir_hash=ir_hash(ir),
        job_profile=job_profile,
        policy_version=policy.version,
        operations=operations,
        provenance={
            "policy_version": policy.version,
            "source_schema_version": ir.schema_version,
        },
    )
    diff = DiffContract(
        semantic=semantic,
        source=[
            item.model_copy(update={"reason": "Generated from approved semantic operation"})
            for item in semantic
        ],
    )
    return patch, diff


def job_profile_from_request(
    *,
    title: str,
    company_name: str | None,
    description: str | None,
    matched_skills: list[str] | None = None,
    missing_skills: list[str] | None = None,
) -> JobProfile:
    description_hash = (
        hashlib.sha256(description.encode("utf-8")).hexdigest()
        if description
        else None
    )
    return JobProfile(
        title=title,
        company_name=company_name,
        required_skills=list(matched_skills or []),
        preferred_skills=list(missing_skills or []),
        description_hash=description_hash,
    )
