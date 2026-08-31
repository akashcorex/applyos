"""LangGraph StateGraph for workflow orchestration.

Replaces the linear ``run_workflow`` coroutine with a typed state graph:

    START → discover_funding → ingest_jobs → filter_jobs → apply_jobs → finalize → END
                                 ↑              ↑             ↑
                          conditional edges route based on state (empty targets,
                          no shortlist, all tasks terminal, etc.)

The original ``services/workflow.run_workflow`` is kept for backward
compatibility with existing tests; this module is the new production path.
"""

from __future__ import annotations

import asyncio
import logging
import time

import httpx
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from config import settings
from models import (
    ApplyTaskRecord,
    AtsType,
    DiscoveredJobRecord,
    JobPayload,
    StartWorkflowRequest,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)
from services.apply_client import ApplyAgentClient
from services.durable_workflow_client import DurableWorkflowClient
from services.filter import filter_jobs
from services.funding_client import FundingClient
from services.job_client import JobAgentClient
from services.state import WorkflowState
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


def build_job_id(workflow_id: str, dedup_key: str) -> str:
    return f"{workflow_id}:{dedup_key}"


def _ats_from_url(url: str) -> AtsType:
    lowered = url.lower()
    if "lever.co" in lowered:
        return "lever"
    if "greenhouse.io" in lowered or "boards.greenhouse" in lowered:
        return "greenhouse"
    if "ashbyhq.com" in lowered:
        return "ashby"
    if "workable.com" in lowered:
        return "workable"
    if "recruitee.com" in lowered:
        return "recruitee"
    if "personio" in lowered:
        return "personio"
    if "wellfound.com" in lowered or "angel.co/jobs" in lowered:
        return "wellfound"
    return "generic"


async def _wait_until_runnable(store: WorkflowStore, workflow_id: str) -> bool:
    """Block graph progress while paused and stop before new side effects."""
    while True:
        run = await store.get(workflow_id)
        if run is None or run.status == WorkflowStatus.cancelled:
            return False
        if run.status != WorkflowStatus.paused:
            return True
        await asyncio.sleep(1)


def _direct_jobs_to_records(request: StartWorkflowRequest) -> list[DiscoveredJobRecord]:
    records: list[DiscoveredJobRecord] = []
    for job in request.jobs:
        source: AtsType = job.source or _ats_from_url(job.application_url)
        external_id = job.external_id or job.application_url.rstrip("/").split("/")[-1]
        dedup_key = job.dedup_key or f"{source}:{job.company_name}:{external_id}"
        records.append(
            DiscoveredJobRecord(
                external_id=external_id,
                source=source,
                title=job.title,
                company_name=job.company_name,
                department=job.department,
                location=job.location,
                application_url=job.application_url,
                description_raw=job.description_raw,
                dedup_key=dedup_key,
                filter_score=1.0,
                cv_data=job.cv_data,
            )
        )
    return records


# ── Graph nodes ──────────────────────────────────────────────────────────


async def discover_funding_node(state: WorkflowState, config) -> dict:
    """Resolve funding targets when none are provided in the request."""
    store: WorkflowStore = config["configurable"]["store"]
    funding_client: FundingClient = config["configurable"]["funding_client"]
    job_client: JobAgentClient = config["configurable"]["job_client"]
    request: StartWorkflowRequest = state["request"]
    workflow_id = state["workflow_id"]

    if not await _wait_until_runnable(store, workflow_id):
        return {"targets": [], "errors": [], "status": WorkflowStatus.cancelled}

    if request.jobs:
        return {"targets": list(request.targets), "errors": []}

    targets = list(request.targets)
    if targets:
        return {"targets": targets, "errors": []}

    await store.update_status(workflow_id, WorkflowStatus.discovering_funding)
    try:
        targets = await funding_client.resolve_targets(
            job_client,
            sources=request.funding_sources,
            limit=request.funding_limit,
            min_round=request.funding_min_round,
            since_date=request.funding_since_date,
        )
    except httpx.HTTPError as exc:
        message = f"Funding discovery failed: {exc}"
        logger.error(message)
        await store.append_error(workflow_id, message)
        await store.update_status(workflow_id, WorkflowStatus.failed)
        return {"targets": [], "errors": [message], "status": WorkflowStatus.failed}

    if not targets:
        message = "Funding discovery returned no companies with detectable ATS"
        logger.warning(message)
        await store.append_error(workflow_id, message)
        await store.update_status(workflow_id, WorkflowStatus.completed)
        return {"targets": [], "errors": [message], "status": WorkflowStatus.completed}

    return {"targets": targets, "errors": []}


async def ingest_jobs_node(state: WorkflowState, config) -> dict:
    """Ingest jobs from each company target via job-agent."""
    store: WorkflowStore = config["configurable"]["store"]
    job_client: JobAgentClient = config["configurable"]["job_client"]
    request: StartWorkflowRequest = state["request"]
    workflow_id = state["workflow_id"]

    await store.update_status(workflow_id, WorkflowStatus.discovering)
    if not await _wait_until_runnable(store, workflow_id):
        return {"discovered_jobs": [], "errors": [], "status": WorkflowStatus.cancelled}

    existing = await store.get(workflow_id)
    if existing is not None and existing.discovered_jobs:
        return {"discovered_jobs": existing.discovered_jobs, "errors": []}

    if request.jobs:
        discovered = _direct_jobs_to_records(request)
        logger.info(
            "Using %d direct job(s) for workflow %s (skip company ingest)",
            len(discovered),
            workflow_id,
        )
        return {"discovered_jobs": discovered, "errors": []}

    discovered: list = []
    errors: list[str] = []

    for target in state["targets"]:
        try:
            jobs = await job_client.ingest_company(target)
            discovered.extend(jobs)
        except httpx.HTTPStatusError as exc:
            message = (
                f"Ingest failed for {target.company_name} "
                f"({target.ats_type}): HTTP {exc.response.status_code}"
            )
            logger.error(message)
            errors.append(message)
            await store.append_error(workflow_id, message)
        except httpx.HTTPError as exc:
            message = f"Ingest failed for {target.company_name}: {exc}"
            logger.error(message)
            errors.append(message)
            await store.append_error(workflow_id, message)

    return {"discovered_jobs": discovered, "errors": errors}


async def filter_jobs_node(state: WorkflowState, config) -> dict:
    """Filter, rank, and cap discovered jobs."""
    store: WorkflowStore = config["configurable"]["store"]
    request = state["request"]
    workflow_id = state["workflow_id"]

    await store.update_status(workflow_id, WorkflowStatus.filtering)
    if not await _wait_until_runnable(store, workflow_id):
        return {"shortlisted": []}

    if request.jobs:
        # Caller already chose the exact listing(s) — do not re-rank/drop them.
        shortlisted = list(state["discovered_jobs"])
        if request.auto_apply and request.max_total_applies > 0:
            shortlisted = shortlisted[: request.max_total_applies]
    else:
        shortlisted = filter_jobs(state["discovered_jobs"], request)

    await store.set_discovered_jobs(workflow_id, shortlisted)

    if not request.auto_apply or request.max_total_applies == 0 or not shortlisted:
        await store.update_status(workflow_id, WorkflowStatus.completed)

    return {"shortlisted": shortlisted}


async def apply_jobs_node(state: WorkflowState, config) -> dict:
    """Trigger apply-agent for each shortlisted job."""
    store: WorkflowStore = config["configurable"]["store"]
    apply_client: ApplyAgentClient = config["configurable"]["apply_client"]
    durable_client = DurableWorkflowClient()
    request = state["request"]
    workflow_id = state["workflow_id"]

    await store.update_status(workflow_id, WorkflowStatus.applying)
    if not await _wait_until_runnable(store, workflow_id):
        return {"apply_tasks": [], "errors": []}

    current = await store.get(workflow_id)
    existing_tasks = list(current.apply_tasks) if current is not None else []
    existing_by_job = {task.job_id: task for task in existing_tasks}
    apply_tasks: list[ApplyTaskRecord] = list(existing_tasks)
    errors: list[str] = []
    skip_statuses = TERMINAL_APPLY_STATUSES
    in_flight_statuses = {"queued", "running"}

    variant_by_dedup = {
        job.dedup_key: job.resume_variant_id
        for job in request.jobs
        if job.dedup_key and job.resume_variant_id
    }

    for job in state["shortlisted"][: request.max_total_applies]:
        if not await _wait_until_runnable(store, workflow_id):
            break
        job_id = build_job_id(workflow_id, job.dedup_key)
        prior = existing_by_job.get(job_id)
        if prior is not None and (
            prior.status in skip_statuses
            or (prior.status in in_flight_statuses and prior.task_id)
        ):
            await store.index_job(workflow_id, job_id)
            continue

        application_url = job.application_url or ""
        if not application_url:
            continue
        variant_id = variant_by_dedup.get(job.dedup_key)
        idempotency_key = None
        if variant_id:
            idempotency_key = (
                f"{request.user_profile.user_id}:{job.dedup_key}:{variant_id}"
            )
        application_id = await durable_client.resolve_application_id(
            workflow_id, job.dedup_key
        )
        payload = JobPayload(
            job_id=job_id,
            job_url=application_url,
            company_name=job.company_name,
            job_title=job.title,
            job_description=job.description_raw,
            cv_data=job.cv_data or request.cv_data,
            user_profile=request.user_profile,
            resume_variant_id=variant_id,
            idempotency_key=idempotency_key,
            application_id=application_id,
            auto_submit=request.auto_submit,
        )

        # Persist a placeholder before dispatch so a fast result cannot be dropped.
        await store.index_job(workflow_id, job_id)
        placeholder = ApplyTaskRecord(
            job_id=job_id,
            job_title=job.title,
            company_name=job.company_name,
            application_url=application_url,
            status="queued",
        )
        existing_by_job[job_id] = placeholder
        apply_tasks = [item for item in apply_tasks if item.job_id != job_id]
        apply_tasks.append(placeholder)
        await store.upsert_apply_task(workflow_id, placeholder)
        try:
            result = await apply_client.trigger_apply(payload)
            await store.attach_apply_task_id(workflow_id, job_id, result.task_id)
            placeholder.task_id = result.task_id
        except httpx.HTTPError as exc:
            message = f"Apply trigger failed for {job.title}: {exc}"
            logger.error(message)
            errors.append(message)
            placeholder.status = "failed"
            placeholder.error_detail = message
            await store.upsert_apply_task(workflow_id, placeholder)

    if not apply_tasks:
        await store.update_status(workflow_id, WorkflowStatus.completed)
    elif all(task.status in TERMINAL_APPLY_STATUSES for task in apply_tasks):
        await store.finalize_if_complete(workflow_id)

    return {"apply_tasks": apply_tasks, "errors": errors}


async def finalize_node(state: WorkflowState, config) -> dict:
    """Poll for apply results and finalize the workflow."""
    store: WorkflowStore = config["configurable"]["store"]
    workflow_id = state["workflow_id"]

    deadline = time.monotonic() + settings.apply_result_timeout_seconds

    while time.monotonic() < deadline:
        run = await store.get(workflow_id)
        if run is None or run.status == WorkflowStatus.cancelled or not run.apply_tasks:
            return {}
        if run.status == WorkflowStatus.paused:
            await asyncio.sleep(1)
            continue

        if all(task.status in TERMINAL_APPLY_STATUSES for task in run.apply_tasks):
            await store.finalize_if_complete(workflow_id)
            return {}

        await asyncio.sleep(2)

    await store.mark_timed_out_tasks(workflow_id)
    return {}


# ── Routing functions ────────────────────────────────────────────────────


def route_after_funding(state: WorkflowState) -> str:
    request = state["request"]
    if request.jobs:
        return "ingest_jobs"
    if not state.get("targets"):
        return END
    return "ingest_jobs"


def route_after_filter(state: WorkflowState) -> str:
    request = state["request"]
    shortlisted = state.get("shortlisted", [])
    if not request.auto_apply or not shortlisted or request.max_total_applies == 0:
        return END
    return "apply_jobs"


def route_after_apply(state: WorkflowState) -> str:
    tasks = state.get("apply_tasks", [])
    if not tasks or all(task.status in TERMINAL_APPLY_STATUSES for task in tasks):
        return END
    return "finalize"


# ── Graph builder ────────────────────────────────────────────────────────


def build_workflow_graph():
    # MemorySaver is process-local. Redis apply_tasks (+ skip/upsert) are the
    # durable source of truth across restarts; do not treat the checkpointer as one.
    graph = StateGraph(WorkflowState)
    graph.add_node("discover_funding", discover_funding_node)
    graph.add_node("ingest_jobs", ingest_jobs_node)
    graph.add_node("filter_jobs", filter_jobs_node)
    graph.add_node("apply_jobs", apply_jobs_node)
    graph.add_node("finalize", finalize_node)

    graph.add_edge(START, "discover_funding")
    graph.add_conditional_edges("discover_funding", route_after_funding)
    graph.add_edge("ingest_jobs", "filter_jobs")
    graph.add_conditional_edges("filter_jobs", route_after_filter)
    graph.add_conditional_edges("apply_jobs", route_after_apply)
    graph.add_edge("finalize", END)

    return graph.compile(checkpointer=MemorySaver())


# ── Public entry point ──────────────────────────────────────────────────


async def run_workflow_graph(
    workflow_id: str,
    request: StartWorkflowRequest,
    store: WorkflowStore,
    job_client: JobAgentClient | None = None,
    apply_client: ApplyAgentClient | None = None,
    funding_client: FundingClient | None = None,
) -> None:
    """Run the LangGraph workflow and persist state via the store."""
    job_client = job_client or JobAgentClient()
    apply_client = apply_client or ApplyAgentClient()
    funding_client = funding_client or FundingClient()

    graph = build_workflow_graph()
    initial_state: WorkflowState = {
        "workflow_id": workflow_id,
        "request": request,
        "targets": list(request.targets),
        "discovered_jobs": [],
        "shortlisted": [],
        "apply_tasks": [],
        "errors": [],
        "status": WorkflowStatus.pending,
    }
    config = {
        "configurable": {
            "thread_id": workflow_id,
            "store": store,
            "job_client": job_client,
            "apply_client": apply_client,
            "funding_client": funding_client,
        }
    }

    try:
        await graph.ainvoke(initial_state, config=config)
    except Exception as exc:
        logger.exception("Workflow %s failed: %s", workflow_id, exc)
        await store.append_error(workflow_id, str(exc))
        await store.update_status(workflow_id, WorkflowStatus.failed)
