"""LangChain tools wrapping job-agent, resume-agent, and apply-agent."""

from __future__ import annotations

import json
import logging

import httpx
from langchain_core.tools import StructuredTool

from config import settings
from models import (
    ApplyTaskRecord,
    CompanyTarget,
    CVData,
    DecisionRecord,
    DiscoveredJobRecord,
    JobPayload,
    WorkflowStatus,
)
from services.decision.context import DecisionContext
from services.decision.policy import evaluate_job

logger = logging.getLogger(__name__)

APPLIED_KEY_PREFIX = "applied_keys:"


def _job_id(workflow_id: str, dedup_key: str) -> str:
    return f"{workflow_id}:{dedup_key}"


def _dump_jobs(jobs: list[DiscoveredJobRecord], limit: int = 20) -> str:
    payload = []
    for job in jobs[:limit]:
        payload.append(
            {
                "title": job.title,
                "company_name": job.company_name,
                "location": job.location,
                "seniority": job.seniority,
                "application_url": job.application_url,
                "dedup_key": job.dedup_key,
                "score": round(job.filter_score, 3),
            }
        )
    return json.dumps({"count": len(jobs), "jobs": payload})


async def load_applied_keys(ctx: DecisionContext) -> set[str]:
    redis = ctx.store._redis  # noqa: SLF001 — shared Redis client
    key = f"{APPLIED_KEY_PREFIX}{ctx.request.user_id}"
    members = await redis.smembers(key)
    return {
        item.decode() if isinstance(item, bytes) else str(item) for item in members
    }


async def mark_applied(ctx: DecisionContext, dedup_key: str) -> None:
    redis = ctx.store._redis  # noqa: SLF001
    key = f"{APPLIED_KEY_PREFIX}{ctx.request.user_id}"
    await redis.sadd(key, dedup_key)
    await redis.expire(key, settings.applied_keys_ttl_seconds)
    ctx.applied_dedup.add(dedup_key)


def build_tools(ctx: DecisionContext) -> list[StructuredTool]:
    async def parse_resume() -> str:
        data = await ctx.resume_client.get_resume(
            ctx.request.resume_id, ctx.request.user_id
        )
        ctx.cv_data = CVData(
            full_name=str(data.get("full_name") or ""),
            email=str(data.get("email") or ""),
            phone=data.get("phone"),
            location=data.get("location"),
            summary=data.get("summary"),
            experience_years=ctx.request.years_experience,
            skills=list(data.get("skills") or []),
            education=[
                item if isinstance(item, dict) else dict(item)
                for item in (data.get("education") or [])
            ],
            work_history=[
                item if isinstance(item, dict) else dict(item)
                for item in (data.get("work_history") or [])
            ],
            resume_url=data.get("file_path"),
        )
        await ctx.store.update_cv_data(ctx.workflow_id, ctx.cv_data)
        return json.dumps(
            {
                "full_name": ctx.cv_data.full_name,
                "email": ctx.cv_data.email,
                "skills": ctx.cv_data.skills[:20],
                "experience_years": ctx.cv_data.experience_years,
                "preferred_role": ctx.profile.preferred_role,
                "resume_url": ctx.cv_data.resume_url,
            }
        )

    async def search_jobs(job_title: str | None = None) -> str:
        await ctx.store.update_status(ctx.workflow_id, WorkflowStatus.discovering)
        role = (job_title or ctx.profile.preferred_role).strip()
        skills = ctx.cv_data.skills if ctx.cv_data else []
        try:
            jobs = await ctx.job_client.search_jobs(
                role,
                skills=skills,
                experience_years=ctx.profile.years_experience,
                summary=ctx.cv_data.summary if ctx.cv_data else None,
                recent_role=(
                    (ctx.cv_data.work_history or [{}])[0].get("title")
                    if ctx.cv_data and ctx.cv_data.work_history
                    else None
                ),
            )
        except httpx.HTTPError as exc:
            logger.warning("search_jobs failed: %s", exc)
            return json.dumps({"error": str(exc), "count": 0, "jobs": []})
        _merge_candidates(ctx, jobs)
        await ctx.store.set_discovered_jobs(ctx.workflow_id, ctx.candidates)
        return _dump_jobs(jobs)

    async def detect_ats(career_page_url: str) -> str:
        try:
            ats_type, slug, confidence = await ctx.job_client.detect_ats(
                career_page_url
            )
        except httpx.HTTPError as exc:
            logger.warning("detect_ats failed for %s: %s", career_page_url, exc)
            return json.dumps(
                {
                    "ats_type": None,
                    "suggested_slug": None,
                    "confidence": "none",
                    "career_page_url": career_page_url,
                    "error": "detect failed; skip this URL and apply from search results",
                }
            )
        return json.dumps(
            {
                "ats_type": ats_type,
                "suggested_slug": slug,
                "confidence": confidence,
                "career_page_url": career_page_url,
            }
        )

    async def ingest_board(
        company_name: str,
        ats_type: str | None = None,
        ats_slug: str | None = None,
        career_page_url: str | None = None,
    ) -> str:
        try:
            if (not ats_type or not ats_slug) and career_page_url:
                ats_type, ats_slug, _confidence = await ctx.job_client.detect_ats(
                    career_page_url
                )
            if not ats_type or not ats_slug or ats_type == "generic":
                return json.dumps(
                    {
                        "error": "unknown board; skip or scrape_career_page",
                        "company_name": company_name,
                    }
                )
            try:
                target = CompanyTarget(
                    company_name=company_name,
                    ats_type=ats_type,  # type: ignore[arg-type]
                    ats_slug=ats_slug,
                )
            except Exception:
                return json.dumps(
                    {
                        "error": "unknown board; skip or scrape_career_page",
                        "company_name": company_name,
                    }
                )
            jobs = await ctx.job_client.ingest_company(target)
        except httpx.HTTPError as exc:
            logger.warning("ingest_board failed for %s: %s", company_name, exc)
            return json.dumps(
                {
                    "error": str(exc),
                    "company_name": company_name,
                    "jobs": [],
                }
            )
        _merge_candidates(ctx, jobs)
        await ctx.store.set_discovered_jobs(ctx.workflow_id, ctx.candidates)
        return _dump_jobs(jobs)

    async def scrape_career_page(
        career_page_url: str,
        company_name: str | None = None,
    ) -> str:
        try:
            jobs = await ctx.job_client.scrape_career_page(
                career_page_url,
                job_role=ctx.profile.preferred_role,
                company_name=company_name,
            )
        except httpx.HTTPError as exc:
            logger.warning("scrape_career_page failed for %s: %s", career_page_url, exc)
            return json.dumps(
                {
                    "error": str(exc),
                    "career_page_url": career_page_url,
                    "jobs": [],
                }
            )
        _merge_candidates(ctx, jobs)
        await ctx.store.set_discovered_jobs(ctx.workflow_id, ctx.candidates)
        return _dump_jobs(jobs)

    async def apply_to_job(
        application_url: str,
        title: str,
        company_name: str,
        dedup_key: str | None = None,
        description: str | None = None,
        reason: str = "",
    ) -> str:
        if ctx.cv_data is None or not (ctx.cv_data.resume_url or "").strip():
            return json.dumps({"error": "parse_resume first; resume file is required"})

        job = _find_or_build_job(
            ctx,
            application_url=application_url,
            title=title,
            company_name=company_name,
            dedup_key=dedup_key,
            description=description,
        )
        verdict = evaluate_job(
            job,
            ctx.profile,
            seen_dedup=ctx.queued_dedup,
            applied_dedup=ctx.applied_dedup,
            per_company=ctx.per_company,
            queued_count=len(ctx.apply_tasks),
            max_applies=ctx.request.max_applies,
        )
        if not verdict.allowed:
            await ctx.store.append_decision(
                ctx.workflow_id,
                DecisionRecord(
                    action="skip",
                    job_title=title,
                    company_name=company_name,
                    reason=verdict.reason,
                    dedup_key=job.dedup_key,
                ),
            )
            return json.dumps({"skipped": True, "reason": verdict.reason})

        await ctx.store.update_status(ctx.workflow_id, WorkflowStatus.applying)
        job_id = _job_id(ctx.workflow_id, job.dedup_key)
        payload = JobPayload(
            job_id=job_id,
            job_url=job.application_url,  # type: ignore[arg-type]
            company_name=job.company_name,
            job_title=job.title,
            job_description=job.description_raw,
            cv_data=ctx.cv_data,
            user_profile=ctx.profile,
        )
        try:
            result = await ctx.apply_client.trigger_apply(payload)
        except httpx.HTTPError as exc:
            message = f"Apply trigger failed for {job.title}: {exc}"
            logger.error(message)
            task = ApplyTaskRecord(
                job_id=job_id,
                job_title=job.title,
                company_name=job.company_name,
                application_url=str(job.application_url or ""),
                status="failed",
                error_detail=message,
            )
            ctx.apply_tasks.append(task)
            await ctx.store.append_apply_task(ctx.workflow_id, task)
            await ctx.store.append_error(ctx.workflow_id, message)
            return json.dumps({"queued": False, "error": message})

        task = ApplyTaskRecord(
            job_id=job_id,
            job_title=job.title,
            company_name=job.company_name,
            application_url=str(job.application_url or ""),
            task_id=result.task_id,
            status="queued",
        )
        ctx.apply_tasks.append(task)
        ctx.queued_dedup.add(job.dedup_key)
        ctx.per_company[job.company_name] = ctx.per_company.get(job.company_name, 0) + 1
        await mark_applied(ctx, job.dedup_key)
        await ctx.store.append_apply_task(ctx.workflow_id, task)
        await ctx.store.index_job(ctx.workflow_id, job_id)
        await ctx.store.append_decision(
            ctx.workflow_id,
            DecisionRecord(
                action="apply",
                job_title=job.title,
                company_name=job.company_name,
                reason=reason or "matched role and experience",
                dedup_key=job.dedup_key,
            ),
        )
        return json.dumps(
            {
                "queued": True,
                "job_id": job_id,
                "task_id": result.task_id,
                "queued_count": len(ctx.apply_tasks),
                "max_applies": ctx.request.max_applies,
            }
        )

    async def get_apply_status() -> str:
        run = await ctx.store.get(ctx.workflow_id)
        if run is None:
            return json.dumps({"error": "run not found"})
        return json.dumps(
            {
                "status": run.status.value,
                "tasks": [
                    {
                        "job_title": task.job_title,
                        "company_name": task.company_name,
                        "status": task.status,
                        "error_detail": task.error_detail,
                    }
                    for task in run.apply_tasks
                ],
            }
        )

    async def finish(summary: str = "") -> str:
        ctx.finished = True
        ctx.finish_summary = summary
        return json.dumps({"finished": True, "summary": summary})

    return [
        StructuredTool.from_function(
            coroutine=parse_resume,
            name="parse_resume",
            description="Load structured CV data from the uploaded resume.",
        ),
        StructuredTool.from_function(
            coroutine=search_jobs,
            name="search_jobs",
            description="Search open jobs for a role. Optional job_title overrides the user role.",
        ),
        StructuredTool.from_function(
            coroutine=detect_ats,
            name="detect_ats",
            description="Inspect a career page URL and return board metadata if known.",
        ),
        StructuredTool.from_function(
            coroutine=ingest_board,
            name="ingest_board",
            description=(
                "Pull jobs from a known company board. Pass ats_type and ats_slug from "
                "detect_ats, or a career_page_url to detect then ingest."
            ),
        ),
        StructuredTool.from_function(
            coroutine=scrape_career_page,
            name="scrape_career_page",
            description="Extract job listings from an unknown or custom career page URL.",
        ),
        StructuredTool.from_function(
            coroutine=apply_to_job,
            name="apply_to_job",
            description="Queue an application to a specific listing. Policy may skip it.",
        ),
        StructuredTool.from_function(
            coroutine=get_apply_status,
            name="get_apply_status",
            description="Poll status of queued applications for this run.",
        ),
        StructuredTool.from_function(
            coroutine=finish,
            name="finish",
            description="End the run after enough applies are queued or no jobs remain.",
        ),
    ]


def _merge_candidates(ctx: DecisionContext, jobs: list[DiscoveredJobRecord]) -> None:
    by_key = {job.dedup_key: job for job in ctx.candidates if job.dedup_key}
    for job in jobs:
        if job.dedup_key and job.dedup_key not in by_key:
            ctx.candidates.append(job)
            by_key[job.dedup_key] = job


def _find_or_build_job(
    ctx: DecisionContext,
    *,
    application_url: str,
    title: str,
    company_name: str,
    dedup_key: str | None,
    description: str | None,
) -> DiscoveredJobRecord:
    if dedup_key:
        for job in ctx.candidates:
            if job.dedup_key == dedup_key:
                return job
    for job in ctx.candidates:
        if job.application_url == application_url:
            return job
    key = dedup_key or f"generic:{company_name}:{application_url}"
    return DiscoveredJobRecord(
        external_id=application_url.rstrip("/").split("/")[-1],
        source="generic",
        title=title,
        company_name=company_name,
        application_url=application_url,
        description_raw=description,
        dedup_key=key,
    )
