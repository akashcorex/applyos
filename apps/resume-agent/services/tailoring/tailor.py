"""Create and suggest improvements for job-specific resume variants."""

from __future__ import annotations

import logging
import re

from models import (
    CreateVariantRequest,
    ResumeRecord,
    ResumeVariantResponse,
    VariantContent,
    VariantSuggestions,
)
from services.ir import build_patch, ir_to_variant_content, job_profile_from_request
from services.revisions import RevisionRepository
from services.tailoring.policy import TailoringPolicyError, validate_patch
from services.tailoring.apply_suggestions import apply_suggestions
from services.tailoring.base_profile import record_to_base_profile
from services.tailoring.profile_text import variant_content_to_prompt_text
from services.tailoring.repository import VariantRepository
from services.tailoring.suggestions import enrich_suggestion, rank_and_cap
from services.tailoring.validator import VariantValidationError, validate_variant_content
from services.tailoring.versions import VersionRepository

logger = logging.getLogger(__name__)


class TailorService:
    def __init__(
        self,
        repository: VariantRepository,
        version_repository: VersionRepository | None = None,
        rag_pipeline: object | None = None,
        revision_repository: RevisionRepository | None = None,
    ) -> None:
        self._repo = repository
        self._versions = version_repository
        self._rag = rag_pipeline
        self._revisions = revision_repository

    async def create_draft(
        self,
        resume_id: str,
        master: ResumeRecord,
        request: CreateVariantRequest,
        *,
        base_content: VariantContent | None = None,
    ) -> ResumeVariantResponse:
        existing = await self._repo.get_by_dedup_key(resume_id, request.dedup_key)
        if existing is not None:
            return await self._repo.update_job_metadata(
                resume_id, existing.id, request
            )

        source = base_content or record_to_base_profile(master)
        source_revision_id = None
        if self._revisions is not None:
            latest = await self._revisions.ensure_revision_for_record(
                resume_id=resume_id,
                record=master,
            )
            source_revision_id = latest[0]
            source = ir_to_variant_content(latest[1])
        suggestions = await self._generate_suggestions(
            resume_id=resume_id,
            request=request,
            content=source,
        )
        return await self._repo.create_draft(
            resume_id=resume_id,
            user_id=master.user_id,
            source_content=source,
            request=request,
            suggestions=suggestions,
            source_revision_id=source_revision_id,
        )

    async def suggest(
        self,
        resume_id: str,
        master: ResumeRecord,
        variant: ResumeVariantResponse,
    ) -> ResumeVariantResponse:
        request = CreateVariantRequest(
            dedup_key=variant.dedup_key,
            job_title=variant.job_title or "Role",
            company_name=variant.company_name or "Company",
            job_description=variant.job_description,
        )
        suggestions = await self._generate_suggestions(
            resume_id=resume_id,
            request=request,
            content=variant.content,
        )
        return await self._repo.update(
            resume_id,
            variant.id,
            suggestions=suggestions,
            status="draft",
        )

    async def update_variant(
        self,
        resume_id: str,
        variant: ResumeVariantResponse,
        *,
        content: VariantContent | None = None,
        accepted_suggestion_ids: list[str] | None = None,
    ) -> ResumeVariantResponse:
        updated_content = content or variant.content

        if accepted_suggestion_ids:
            updated_content = apply_suggestions(
                updated_content,
                variant.suggestions.suggestions,
                accepted_suggestion_ids,
            )

        patch_id: str | None = None
        source_revision_id = variant.source_revision_id
        diff = variant.diff
        if self._revisions is not None:
            latest = (
                await self._revisions.get_revision(resume_id, source_revision_id)
                if source_revision_id
                else await self._revisions.get_latest_revision(resume_id)
            )
            if latest is not None:
                if isinstance(latest, tuple):
                    source_revision_id, ir = latest
                else:
                    ir = latest
                profile = job_profile_from_request(
                    title=variant.job_title or "Role",
                    company_name=variant.company_name,
                    description=variant.job_description,
                )
                try:
                    patch, diff = build_patch(
                        ir=ir,
                        target=updated_content,
                        source_revision_id=source_revision_id,
                        job_profile=profile,
                    )
                    validate_patch(patch, ir)
                    stored_patch = await self._revisions.save_patch(
                        resume_id=resume_id,
                        variant_id=variant.id,
                        patch=patch,
                        diff=diff,
                    )
                    patch_id = stored_patch.id
                except (ValueError, TailoringPolicyError) as exc:
                    raise VariantValidationError([str(exc)]) from exc

        updated = await self._repo.update(
            resume_id,
            variant.id,
            content=updated_content,
            status="draft",
            source_revision_id=source_revision_id,
            patch_id=patch_id,
        )
        await self._snapshot(updated, "save_draft")
        return updated.model_copy(
            update={
                "source_revision_id": source_revision_id,
                "patch_id": patch_id,
                "diff": diff,
            }
        )

    async def finalize_variant(
        self,
        resume_id: str,
        variant: ResumeVariantResponse,
    ) -> ResumeVariantResponse:
        await self.validate(variant.content)
        await self._snapshot(variant, "pre_finalize")
        return variant

    async def _snapshot(
        self,
        variant: ResumeVariantResponse,
        reason: str,
    ) -> None:
        if self._versions is None:
            return
        await self._versions.save_snapshot(
            variant_id=variant.id,
            resume_id=variant.resume_id,
            content=variant.content,
            change_reason=reason,
        )

    async def _generate_suggestions(
        self,
        *,
        resume_id: str,
        request: CreateVariantRequest,
        content: VariantContent,
    ) -> VariantSuggestions:
        job_desc = request.job_description or ""
        has_job = bool(job_desc.strip())
        if request.missing_skills:
            job_desc += "\n\nMissing skills to address: " + ", ".join(
                request.missing_skills
            )
        if request.matched_skills:
            job_desc += "\n\nAlready matched skills: " + ", ".join(
                request.matched_skills
            )

        if self._rag is not None:
            try:
                profile_text = _relevant_prompt_text(content, job_desc)
                result = await self._rag.improve(  # type: ignore[union-attr]
                    resume_id=resume_id,
                    target_role=request.job_title,
                    job_description=job_desc[:8000],
                    profile_context=profile_text,
                )
                return rank_and_cap(_with_ids(result, has_job_context=has_job))
            except Exception as exc:
                logger.warning("RAG tailor failed, using structured fallback: %s", exc)

        return rank_and_cap(_structured_fallback(content, request, has_job))


    @staticmethod
    async def validate(content: VariantContent) -> None:
        validate_variant_content(content)


def _relevant_prompt_text(content: VariantContent, job_description: str) -> str:
    """Keep tailoring context to evidence likely relevant to this job."""

    tokens = {
        token.lower()
        for token in re.findall(r"[A-Za-z][A-Za-z0-9+#.-]{2,}", job_description)
    }
    selected: list[str] = []
    if content.summary:
        selected.append(f"Summary: {content.summary[:600]}")
    matching_skills = [
        skill
        for skill in content.skills
        if skill.lower() in tokens
        or any(part in tokens for part in skill.lower().replace("/", " ").split())
    ]
    if matching_skills:
        selected.append(f"Skills: {', '.join(matching_skills)}")
    for role in content.work_history:
        bullets = [
            bullet
            for bullet in role.highlights
            if any(token in bullet.lower() for token in tokens)
        ][:4]
        if bullets:
            selected.append(f"{role.title} at {role.company}: {'; '.join(bullets)}")
    if not selected:
        selected.append(variant_content_to_prompt_text(content)[:1800])
    return "\n".join(selected)[:4000]


def _with_ids(result: dict, *, has_job_context: bool) -> VariantSuggestions:
    raw = result.get("suggestions") or []
    suggestions = [
        enrich_suggestion(item, i, has_job_context=has_job_context)
        for i, item in enumerate(raw)
    ]
    return VariantSuggestions(
        suggestions=suggestions,
        overall_assessment=str(result.get("overall_assessment", "")),
    )


def _structured_fallback(
    content: VariantContent,
    request: CreateVariantRequest,
    has_job: bool,
) -> VariantSuggestions:
    from models import SuggestionWithId

    suggestions: list[SuggestionWithId] = []

    if request.missing_skills:
        existing = {s.lower() for s in content.skills}
        addable = [s for s in request.missing_skills if s.lower() not in existing]
        if addable:
            suggestions.append(
                enrich_suggestion(
                    {
                        "section": "skills",
                        "current": ", ".join(content.skills[:8]) or "missing",
                        "suggested": ", ".join(content.skills + addable[:5]),
                        "reason": (
                            f"Surface relevant skills for {request.job_title} "
                            f"at {request.company_name}."
                        ),
                        "confidence": 0.9,
                        "risk": "high",
                    },
                    0,
                    has_job_context=has_job,
                )
            )

    assessment = (
        f"Top changes for {request.job_title} at {request.company_name}. "
        "Review each suggestion — accept low-risk items first."
    )
    return VariantSuggestions(suggestions=suggestions, overall_assessment=assessment)
