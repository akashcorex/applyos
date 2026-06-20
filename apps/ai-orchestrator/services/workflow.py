"""Workflow state machine and background runner."""

from __future__ import annotations

import asyncio
import logging
import time

import httpx

from config import settings
from models import (
    ApplyTaskRecord,
    JobPayload,
    StartWorkflowRequest,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)
from services.apply_client import ApplyAgentClient
from services.filter import filter_jobs
from services.job_client import JobAgentClient
from services.workflow_store import WorkflowStore

logger = logging.getLogger(__name__)


def build_job_id(workflow_id: str, dedup_key: str) -> str:
    return f"{workflow_id}:{dedup_key}"


async def run_workflow(
    workflow_id: str,
    request: StartWorkflowRequest,
    store: WorkflowStore,
    job_client: JobAgentClient | None = None,
    apply_client: ApplyAgentClient | None = None,
) -> None:
    job_client = job_client or JobAgentClient()
    apply_client = apply_client or ApplyAgentClient()

    try:
        await store.update_status(workflow_id, WorkflowStatus.discovering)
        discovered: list = []

        for target in request.targets:
            try:
                jobs = await job_client.ingest_company(target)
                discovered.extend(jobs)
            except httpx.HTTPStatusError as exc:
                message = (
                    f"Ingest failed for {target.company_name} "
                    f"({target.ats_type}): HTTP {exc.response.status_code}"
                )
                logger.error(message)
                await store.append_error(workflow_id, message)
            except httpx.HTTPError as exc:
                message = f"Ingest failed for {target.company_name}: {exc}"
                logger.error(message)
                await store.append_error(workflow_id, message)

        await store.update_status(workflow_id, WorkflowStatus.filtering)
        shortlisted = filter_jobs(discovered, request)
        await store.set_discovered_jobs(workflow_id, shortlisted)

        if not request.auto_apply or request.max_total_applies == 0:
            await store.update_status(workflow_id, WorkflowStatus.completed)
            return

        if not shortlisted:
            await store.update_status(workflow_id, WorkflowStatus.completed)
            return

        await store.update_status(workflow_id, WorkflowStatus.applying)
        apply_tasks: list[ApplyTaskRecord] = []

        for job in shortlisted[: request.max_total_applies]:
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
            return

        if all(task.status in TERMINAL_APPLY_STATUSES for task in apply_tasks):
            await store.finalize_if_complete(workflow_id)
            return

        await _wait_for_apply_results(workflow_id, store)

    except Exception as exc:
        logger.exception("Workflow %s failed: %s", workflow_id, exc)
        await store.append_error(workflow_id, str(exc))
        await store.update_status(workflow_id, WorkflowStatus.failed)


async def _wait_for_apply_results(workflow_id: str, store: WorkflowStore) -> None:
    deadline = time.monotonic() + settings.apply_result_timeout_seconds

    while time.monotonic() < deadline:
        run = await store.get(workflow_id)
        if run is None:
            return

        if not run.apply_tasks:
            return

        if all(task.status in TERMINAL_APPLY_STATUSES for task in run.apply_tasks):
            await store.finalize_if_complete(workflow_id)
            return

        await asyncio.sleep(2)

    await store.mark_timed_out_tasks(workflow_id)
