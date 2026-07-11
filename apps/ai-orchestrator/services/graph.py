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
    DiscoveredJobRecord,
    JobPayload,
    StartWorkflowRequest,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)
from services.apply_client import ApplyAgentClient
from services.filter import filter_jobs
from services.funding_client import FundingClient
from services.job_client import JobAgentClient
from services.state import WorkflowState
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


def build_job_id(workflow_id: str, dedup_key: str) -> str:
    return f"{workflow_id}:{dedup_key}"


def _ats_from_url(url: str) -> str:
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
    return "lever"


def _direct_jobs_to_records(request: StartWorkflowRequest) -> list[DiscoveredJobRecord]:
    records: list[DiscoveredJobRecord] = []
    for job in request.jobs:
        source = job.source or _ats_from_url(job.application_url)  # type: ignore[arg-type]
        external_id = job.external_id or job.application_url.rstrip("/").split("/")[-1]
        dedup_key = f"{source}:{job.company_name}:{external_id}"
        records.append(
            DiscoveredJobRecord(
                external_id=external_id,
                source=source,  # type: ignore[arg-type]
                title=job.title,
                company_name=job.company_name,
                department=job.department,
                location=job.location,
                application_url=job.application_url,
                description_raw=job.description_raw,
                dedup_key=dedup_key,
                filter_score=1.0,
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
    request = state["request"]
    workflow_id = state["workflow_id"]

    await store.update_status(workflow_id, WorkflowStatus.applying)

    apply_tasks: list[ApplyTaskRecord] = []
    errors: list[str] = []

    for job in state["shortlisted"][: request.max_total_applies]:
        job_id = build_job_id(workflow_id, job.dedup_key)
        payload = JobPayload(
            job_id=job_id,
            job_url=job.application_url,  # type: ignore[arg-type]
            company_name=job.company_name,
            job_title=job.title,
            job_description=job.description_raw,
            cv_data=request.cv_data,
            user_profile=request.user_profile,
        )

        try:
            result = await apply_client.trigger_apply(payload)
            apply_tasks.append(
                ApplyTaskRecord(
                    job_id=job_id,
                    job_title=job.title,
                    company_name=job.company_name,
                    application_url=job.application_url or "",
                    task_id=result.task_id,
                    status="queued",
                )
            )
            await store.index_job(workflow_id, job_id)
        except httpx.HTTPError as exc:
            message = f"Apply trigger failed for {job.title}: {exc}"
            logger.error(message)
            errors.append(message)
            apply_tasks.append(
                ApplyTaskRecord(
                    job_id=job_id,
                    job_title=job.title,
                    company_name=job.company_name,
                    application_url=job.application_url or "",
                    status="failed",
                    error_detail=message,
                )
            )

    await store.set_apply_tasks(workflow_id, apply_tasks)

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
        if run is None or not run.apply_tasks:
            return {}

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
