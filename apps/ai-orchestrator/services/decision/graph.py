"""LangGraph ReAct loop for autonomous job search + apply."""

from __future__ import annotations

import asyncio
import logging
import time

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.prebuilt import create_react_agent

from config import settings
from models import (
    CVData,
    StartRunRequest,
    UserProfile,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)
from services.apply_client import ApplyAgentClient
from services.decision.context import DecisionContext
from services.decision.policy import rank_eligible
from services.decision.prompts import SYSTEM_PROMPT
from services.decision.tools import build_tools, load_applied_keys
from services.job_client import JobAgentClient
from services.resume_client import ResumeAgentClient
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


def _get_llm():
    if not settings.anthropic_api_key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    from langchain_anthropic import ChatAnthropic

    return ChatAnthropic(
        model=settings.llm_model,
        api_key=settings.anthropic_api_key,
        max_tokens=settings.llm_max_tokens,
        timeout=settings.llm_timeout_seconds,
        temperature=0,
    )


async def run_decision(
    workflow_id: str,
    request: StartRunRequest,
    store: WorkflowStore,
    job_client: JobAgentClient | None = None,
    apply_client: ApplyAgentClient | None = None,
    resume_client: ResumeAgentClient | None = None,
) -> None:
    ctx = DecisionContext(
        workflow_id=workflow_id,
        request=request,
        store=store,
        job_client=job_client or JobAgentClient(),
        apply_client=apply_client or ApplyAgentClient(),
        resume_client=resume_client or ResumeAgentClient(),
        profile=UserProfile(
            user_id=request.user_id,
            preferred_role=request.job_role,
            years_experience=request.years_experience,
            preferred_locations=request.preferred_locations,
        ),
    )

    try:
        await store.update_status(workflow_id, WorkflowStatus.deciding)
        ctx.applied_dedup = await load_applied_keys(ctx)
        await _load_resume(ctx)

        if settings.anthropic_api_key:
            await _run_react(ctx)
        else:
            logger.warning("No ANTHROPIC_API_KEY — using deterministic decision path")
            await _run_deterministic(ctx)

        await _wait_for_apply_results(ctx)
    except Exception as exc:
        logger.exception("Decision run %s failed: %s", workflow_id, exc)
        await store.append_error(workflow_id, str(exc))
        await store.update_status(workflow_id, WorkflowStatus.failed)


async def _load_resume(ctx: DecisionContext) -> None:
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
    if not (ctx.cv_data.resume_url or "").strip():
        raise RuntimeError("Resume file is required before applying")
    await ctx.store.update_cv_data(ctx.workflow_id, ctx.cv_data)


async def _run_react(ctx: DecisionContext) -> None:
    tools = build_tools(ctx)
    agent = create_react_agent(_get_llm(), tools)
    skills = ", ".join((ctx.cv_data.skills if ctx.cv_data else [])[:12])
    user_msg = (
        f"Start an autonomous apply run.\n"
        f"job_role: {ctx.profile.preferred_role}\n"
        f"years_experience: {ctx.profile.years_experience}\n"
        f"preferred_locations: {ctx.profile.preferred_locations}\n"
        f"max_applies: {ctx.request.max_applies}\n"
        f"resume_id: {ctx.request.resume_id}\n"
        f"candidate: {ctx.cv_data.full_name if ctx.cv_data else 'unknown'} "
        f"({ctx.cv_data.email if ctx.cv_data else ''})\n"
        f"skills: {skills}\n"
        f"Resume is already loaded. Search, decide, apply, then finish."
    )
    await agent.ainvoke(
        {
            "messages": [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(content=user_msg),
            ]
        },
        config={"recursion_limit": settings.decision_max_steps},
    )


async def _run_deterministic(ctx: DecisionContext) -> None:
    await ctx.store.update_status(ctx.workflow_id, WorkflowStatus.discovering)
    jobs = await ctx.job_client.search_jobs(
        ctx.profile.preferred_role,
        skills=ctx.cv_data.skills if ctx.cv_data else [],
        experience_years=ctx.profile.years_experience,
        summary=ctx.cv_data.summary if ctx.cv_data else None,
    )
    ctx.candidates.extend(jobs)
    await ctx.store.set_discovered_jobs(ctx.workflow_id, ctx.candidates)

    await ctx.store.update_status(ctx.workflow_id, WorkflowStatus.filtering)
    shortlisted = rank_eligible(
        ctx.candidates,
        ctx.profile,
        applied_dedup=ctx.applied_dedup,
        max_applies=ctx.request.max_applies,
    )

    tools_by_name = {tool.name: tool for tool in build_tools(ctx)}
    apply_tool = tools_by_name["apply_to_job"]
    for job in shortlisted:
        await apply_tool.ainvoke(
            {
                "application_url": job.application_url,
                "title": job.title,
                "company_name": job.company_name,
                "dedup_key": job.dedup_key,
                "description": job.description_raw,
                "reason": "deterministic policy shortlist",
            }
        )


async def _wait_for_apply_results(ctx: DecisionContext) -> None:
    if not ctx.apply_tasks:
        await ctx.store.update_status(ctx.workflow_id, WorkflowStatus.completed)
        return

    deadline = time.monotonic() + settings.apply_result_timeout_seconds
    while time.monotonic() < deadline:
        run = await ctx.store.get(ctx.workflow_id)
        if run is None:
            return
        if run.apply_tasks and all(
            task.status in TERMINAL_APPLY_STATUSES for task in run.apply_tasks
        ):
            await ctx.store.finalize_if_complete(ctx.workflow_id)
            return
        await asyncio.sleep(2)

    await ctx.store.mark_timed_out_tasks(ctx.workflow_id)
