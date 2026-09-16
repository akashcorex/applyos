"""Create and suggest improvements for job-specific resume variants."""

from __future__ import annotations

import logging
import re

from config import settings
from models import (
    CreateVariantRequest,
    ResumeRecord,
    ResumeVariantResponse,
    SuggestionWithId,
    VariantContent,
    VariantSuggestions,
)
from services.ir import build_patch, ir_to_variant_content, job_profile_from_request
from services.revisions import RevisionRepository
from services.tailoring.policy import TailoringPolicyError, validate_patch
from services.tailoring.apply_suggestions import apply_suggestions
from services.tailoring.base_profile import record_to_base_profile
from services.tailoring.keyword_rules import build_keyword_rule_suggestions
from services.tailoring.profile_text import variant_content_to_prompt_text
from services.tailoring.repository import VariantRepository
from services.tailoring.suggestion_validator import filter_keyword_suggestions
from services.tailoring.suggestions import (
    enrich_suggestion,
    rank_and_cap,
    safe_suggestion_ids,
)
from services.tailoring.validator import VariantValidationError, validate_variant_content
from services.tailoring.variant_scorer import score_variant
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

        use_llm = settings.tailor_llm_on_create
        suggestions = await self._generate_suggestions(
            resume_id=resume_id,
            request=request,
            content=source,
            include_llm=use_llm,
        )

        baseline = request.initial_match_score
        scored = await self._score_content(source, request)
        if baseline is None:
            baseline = scored.match_score

        return await self._repo.create_draft(
            resume_id=resume_id,
            user_id=master.user_id,
            source_content=source,
            request=request,
            suggestions=suggestions,
            source_revision_id=source_revision_id,
            baseline_match_score=baseline,
            match_score=scored.match_score,
            match_score_meta=scored.as_meta(),
        )

    async def ensure_draft_with_approved_patch(
        self,
        resume_id: str,
        master: ResumeRecord,
        request: CreateVariantRequest,
        *,
        base_content: VariantContent | None = None,
    ) -> ResumeVariantResponse:
        existing = await self._repo.get_by_dedup_key(resume_id, request.dedup_key)
        if existing is not None:
            if existing.status in ("ready", "applied"):
                return await self._repo.update_job_metadata(
                    resume_id, existing.id, request
                )
            if existing.patch_id:
                return await self._repo.update_job_metadata(
                    resume_id, existing.id, request
                )
            variant = existing
        else:
            variant = await self.create_draft(
                resume_id,
                master,
                request,
                base_content=base_content,
            )

        accepted = safe_suggestion_ids(variant.suggestions.suggestions)
        return await self.update_variant(
            resume_id,
            variant,
            accepted_suggestion_ids=accepted or None,
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
            include_llm=True,
        )
        return await self._repo.update(
            resume_id,
            variant.id,
            suggestions=suggestions,
            status="draft",
        )

    async def rescore_variant(
        self,
        resume_id: str,
        variant: ResumeVariantResponse,
    ) -> ResumeVariantResponse:
        request = CreateVariantRequest(
            dedup_key=variant.dedup_key,
            job_title=variant.job_title or "Role",
            company_name=variant.company_name or "Company",
            job_description=variant.job_description,
        )
        scored = await self._score_content(variant.content, request)
        baseline = variant.baseline_match_score
        if baseline is None:
            baseline = scored.match_score
        return await self._repo.update_scores(
            resume_id,
            variant.id,
            match_score=scored.match_score,
            baseline_match_score=baseline,
            match_score_meta=scored.as_meta(),
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
                keyword_mode=settings.tailor_mode == "keyword",
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

        request = CreateVariantRequest(
            dedup_key=variant.dedup_key,
            job_title=variant.job_title or "Role",
            company_name=variant.company_name or "Company",
            job_description=variant.job_description,
        )
        scored = await self._score_content(updated_content, request)
        baseline = variant.baseline_match_score
        if baseline is None:
            baseline = scored.match_score
        scored_variant = await self._repo.update_scores(
            resume_id,
            variant.id,
            match_score=scored.match_score,
            baseline_match_score=baseline,
            match_score_meta=scored.as_meta(),
        )
        return scored_variant.model_copy(
            update={
                "source_revision_id": source_revision_id,
                "patch_id": patch_id,
                "diff": diff,
            }
        )

    async def reject_variant(
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
            missing_skills=(
                variant.match_score_meta.missing_skills
                if variant.match_score_meta
                else []
            ),
            matched_skills=(
                variant.match_score_meta.matched_skills
                if variant.match_score_meta
                else []
            ),
        )
        suggestions = await self._generate_suggestions(
            resume_id=resume_id,
            request=request,
            content=variant.content,
            include_llm=False,
        )
        reset = await self._repo.reset_for_reject(
            resume_id,
            variant.id,
            suggestions=suggestions,
        )
        accepted = safe_suggestion_ids(suggestions.suggestions)
        return await self.update_variant(
            resume_id,
            reset,
            accepted_suggestion_ids=accepted or None,
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

    async def _score_content(
        self,
        content: VariantContent,
        request: CreateVariantRequest,
    ):
        return await score_variant(
            content,
            job_title=request.job_title,
            company_name=request.company_name,
            job_description=request.job_description,
            reference_matched_skills=request.matched_skills,
            reference_missing_skills=request.missing_skills,
        )

    async def _generate_suggestions(
        self,
        *,
        resume_id: str,
        request: CreateVariantRequest,
        content: VariantContent,
        include_llm: bool = False,
    ) -> VariantSuggestions:
        has_job = bool((request.job_description or "").strip())
        rule_items = build_keyword_rule_suggestions(content, request)
        merged: list[SuggestionWithId] = list(rule_items)

        if include_llm and self._rag is not None:
            llm_items = await self._llm_suggestions(
                resume_id=resume_id,
                request=request,
                content=content,
            )
            seen = {(s.section.lower(), s.current.strip()) for s in merged}
            for item in llm_items:
                key = (item.section.lower(), item.current.strip())
                if key not in seen:
                    merged.append(item)
                    seen.add(key)

        capped = rank_and_cap(
            VariantSuggestions(
                suggestions=merged[: settings.tailor_max_suggestions],
                overall_assessment=_overall_assessment(request, merged, has_job),
            )
        )
        capped.suggestions = filter_keyword_suggestions(capped.suggestions, content)
        if len(capped.suggestions) > settings.tailor_max_suggestions:
            capped.suggestions = capped.suggestions[: settings.tailor_max_suggestions]
        return capped

    async def _llm_suggestions(
        self,
        *,
        resume_id: str,
        request: CreateVariantRequest,
        content: VariantContent,
    ) -> list[SuggestionWithId]:
        job_desc = request.job_description or ""
        profile_text = _relevant_prompt_text(content, job_desc)
        try:
            if settings.tailor_mode == "keyword":
                result = await self._rag.improve_keywords(  # type: ignore[union-attr]
                    target_role=request.job_title,
                    job_description=job_desc[:4000],
                    profile_context=profile_text,
                    matched_skills=request.matched_skills,
                    missing_skills=request.missing_skills,
                )
            else:
                result = await self._rag.improve(  # type: ignore[union-attr]
                    resume_id=resume_id,
                    target_role=request.job_title,
                    job_description=job_desc[:8000],
                    profile_context=profile_text,
                )
            parsed = _with_ids(result, has_job_context=bool(job_desc.strip()))
            return filter_keyword_suggestions(parsed.suggestions, content)
        except Exception as exc:
            logger.warning("LLM keyword tailor failed: %s", exc)
            return []

    @staticmethod
    async def validate(content: VariantContent) -> None:
        validate_variant_content(content)


def _overall_assessment(
    request: CreateVariantRequest,
    suggestions: list[SuggestionWithId],
    has_job: bool,
) -> str:
    if not suggestions:
        return (
            f"No keyword tweaks suggested for {request.job_title} at "
            f"{request.company_name}. Edit manually or click Get AI suggestions."
        )
    if has_job:
        return (
            f"{len(suggestions)} keyword alignment tweak(s) for {request.job_title} "
            f"at {request.company_name}. Accept low-risk items first."
        )
    return "Review each suggestion before accepting."


def _relevant_prompt_text(content: VariantContent, job_description: str) -> str:
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
            for bullet in role.highlights or []
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
