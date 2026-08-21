"""Redis-backed workflow persistence."""

from __future__ import annotations


from datetime import UTC, datetime
from typing import Any

import redis.asyncio as redis

from config import settings
from models import (
    ApplyTaskRecord,
    CVData,
    DecisionRecord,
    DiscoveredJobRecord,
    StartWorkflowRequest,
    WorkflowRun,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)
from services.durable_workflow_client import DurableWorkflowClient

WORKFLOW_KEY_PREFIX = "workflow:"
JOB_INDEX_PREFIX = "job_index:"
WORKFLOW_INDEX_KEY = "workflow_ids"


class WorkflowStore:
    def __init__(
        self,
        client: redis.Redis,
        durable_client: DurableWorkflowClient | None = None,
    ) -> None:
        self._redis = client
        self._ttl = settings.workflow_ttl_seconds
        self._durable_client = durable_client or DurableWorkflowClient()

    @property
    def ttl_seconds(self) -> int:
        return self._ttl

    async def _sync_durable_status(
        self,
        workflow_id: str,
        status: str,
        *,
        event_type: str = "workflow.status_changed",
        event_key: str | None = None,
        payload: dict[str, Any] | None = None,
        applications: list[dict[str, Any]] | None = None,
        error_detail: str | None = None,
    ) -> None:
        await self._durable_client.sync_status(
            workflow_id,
            status,
            event_type=event_type,
            event_key=event_key,
            payload=payload,
            applications=applications,
            error_detail=error_detail,
        )

    @staticmethod
    def _workflow_key(workflow_id: str) -> str:
        return f"{WORKFLOW_KEY_PREFIX}{workflow_id}"

    @staticmethod
    def _job_index_key(job_id: str) -> str:
        return f"{JOB_INDEX_PREFIX}{job_id}"

    async def create(
        self,
        workflow_id: str,
        request: StartWorkflowRequest,
    ) -> WorkflowRun:
        run = WorkflowRun(
            id=workflow_id,
            status=WorkflowStatus.pending,
            request=request,
        )
        await self.save(run)
        await self._redis.lpush(WORKFLOW_INDEX_KEY, workflow_id)
        await self._redis.ltrim(WORKFLOW_INDEX_KEY, 0, 99)
        return run

    async def get(self, workflow_id: str) -> WorkflowRun | None:
        raw = await self._redis.get(self._workflow_key(workflow_id))
        if raw is None:
            return None
        return WorkflowRun.model_validate_json(raw)

    async def save(self, run: WorkflowRun) -> None:
        run.updated_at = datetime.now(UTC)
        key = self._workflow_key(run.id)
        await self._redis.set(key, run.model_dump_json(), ex=self._ttl)

    async def update_status(
        self,
        workflow_id: str,
        status: WorkflowStatus,
        *,
        allow_resume: bool = False,
        allow_retry: bool = False,
    ) -> bool:
        """Persist a status transition without undoing a user lifecycle action.

        Graph nodes make normal progress updates concurrently with pause/stop
        requests. Only the explicit resume and retry paths may reactivate a
        paused or cancelled run.
        """
        run = await self.get(workflow_id)
        if run is None:
            return False
        if run.status == WorkflowStatus.cancelled and status != WorkflowStatus.cancelled:
            if not allow_retry:
                return False
        if run.status == WorkflowStatus.paused and status != WorkflowStatus.paused:
            if not allow_resume:
                return False
        run.status = status
        await self.save(run)
        await self._sync_durable_status(workflow_id, status.value)
        return True

    async def append_error(self, workflow_id: str, message: str) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.errors.append(message)
        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="workflow.error",
            payload={"message": message},
            error_detail=message,
        )

    async def set_discovered_jobs(
        self,
        workflow_id: str,
        jobs: list[DiscoveredJobRecord],
    ) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.discovered_jobs = jobs
        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="job.matched",
            payload={"jobCount": len(jobs)},
        )

    async def set_apply_tasks(
        self,
        workflow_id: str,
        tasks: list[ApplyTaskRecord],
    ) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.apply_tasks = tasks
        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="application.queued",
            payload={"applicationCount": len(tasks)},
            applications=[
                {
                    "jobId": task.job_id,
                    "status": task.status,
                    "taskId": task.task_id,
                    "errorDetail": task.error_detail,
                }
                for task in tasks
            ],
        )

    async def upsert_apply_task(
        self,
        workflow_id: str,
        task: ApplyTaskRecord,
    ) -> WorkflowRun | None:
        """Merge one apply task without regressing a terminal Redis result.

        A late HTTPError rewrite must not clobber an already-submitted result
        that landed while the trigger response was still in flight.
        """
        run = await self.get(workflow_id)
        if run is None:
            return None

        for index, existing in enumerate(run.apply_tasks):
            if existing.job_id != task.job_id:
                continue
            if existing.status in TERMINAL_APPLY_STATUSES and task.status not in TERMINAL_APPLY_STATUSES:
                # Keep the terminal result; only fill missing metadata.
                if not existing.task_id and task.task_id:
                    existing.task_id = task.task_id
                await self.save(run)
                return run
            if (
                existing.status in TERMINAL_APPLY_STATUSES
                and task.status in TERMINAL_APPLY_STATUSES
                and existing.status != task.status
                and existing.status in {"submitted", "already_applied"}
            ):
                # Never overwrite a successful apply with a later failure rewrite.
                await self.save(run)
                return run
            run.apply_tasks[index] = task
            break
        else:
            run.apply_tasks.append(task)

        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="application.status_changed",
            applications=[
                {
                    "jobId": task.job_id,
                    "status": task.status,
                    "taskId": task.task_id,
                    "errorDetail": task.error_detail,
                }
            ],
        )
        return run

    async def attach_apply_task_id(
        self,
        workflow_id: str,
        job_id: str,
        task_id: str,
    ) -> WorkflowRun | None:
        """Set the Celery task id without clobbering a result that already landed."""
        run = await self.get(workflow_id)
        if run is None:
            return None
        for task in run.apply_tasks:
            if task.job_id == job_id:
                if not task.task_id:
                    task.task_id = task_id
                break
        else:
            return run
        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="application.queued",
            applications=[
                {
                    "jobId": job_id,
                    "status": next(
                        task.status for task in run.apply_tasks if task.job_id == job_id
                    ),
                    "taskId": task_id,
                }
            ],
        )
        return run

    async def append_apply_task(
        self,
        workflow_id: str,
        task: ApplyTaskRecord,
    ) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.apply_tasks.append(task)
        await self.save(run)

    async def append_decision(
        self,
        workflow_id: str,
        decision: DecisionRecord,
    ) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.decisions.append(decision)
        await self.save(run)

    async def update_cv_data(self, workflow_id: str, cv_data: CVData) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.request.cv_data = cv_data
        await self.save(run)

    async def index_job(self, workflow_id: str, job_id: str) -> None:
        await self._redis.set(
            self._job_index_key(job_id),
            workflow_id,
            ex=self._ttl,
        )

    async def resolve_workflow_id(self, job_id: str) -> str | None:
        raw = await self._redis.get(self._job_index_key(job_id))
        if raw is None:
            return None
        return raw.decode() if isinstance(raw, bytes) else str(raw)

    async def requeue_apply_task(
        self,
        workflow_id: str,
        job_id: str,
        task_id: str,
        *,
        expected_status: str,
        expected_task_id: str | None,
        expected_workflow_status: WorkflowStatus,
    ) -> WorkflowRun | None:
        """Replace a retryable task with a newly queued apply-agent task."""
        run = await self.get(workflow_id)
        if run is None:
            return None

        retryable = {
            "failed",
            "captcha_blocked",
            "login_required",
            "timed_out",
            "cancelled",
            "skipped",
        }
        task = next((task for task in run.apply_tasks if task.job_id == job_id), None)
        if (
            task is None
            or task.status not in retryable
            or task.status != expected_status
            or task.task_id != expected_task_id
            or run.status != expected_workflow_status
        ):
            return None

        task.task_id = task_id
        task.status = "queued"
        task.error_detail = None
        task.page_url = None
        task.screenshot_path = None
        run.status = WorkflowStatus.applying
        await self.save(run)
        await self.index_job(workflow_id, job_id)
        await self._sync_durable_status(
            workflow_id,
            WorkflowStatus.applying.value,
            event_type="application.queued",
            payload={"jobId": job_id, "retry": True},
            applications=[
                {
                    "jobId": job_id,
                    "status": "queued",
                    "taskId": task_id,
                }
            ],
        )
        return run

    async def update_apply_task_status(
        self,
        workflow_id: str,
        job_id: str,
        status: str,
        error_detail: str | None = None,
        *,
        page_url: str | None = None,
        screenshot_path: str | None = None,
    ) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None:
            return None

        updated = False
        for task in run.apply_tasks:
            if task.job_id == job_id:
                # A late worker result must not resurrect a user-stopped task.
                if task.status == "cancelled" and status != "cancelled":
                    return run
                task.status = status
                task.error_detail = error_detail
                if page_url is not None:
                    task.page_url = page_url
                if screenshot_path is not None:
                    task.screenshot_path = screenshot_path
                updated = True
                break

        if not updated:
            return None

        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            event_type="application.status_changed",
            applications=[
                {
                    "jobId": job_id,
                    "status": status,
                    "errorDetail": error_detail,
                    "pageUrl": page_url,
                    "screenshotPath": screenshot_path,
                }
            ],
        )
        return run

    async def update_linkedin_connect_status(
        self,
        workflow_id: str,
        job_id: str,
        status: str,
    ) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None:
            return None

        updated = False
        for task in run.apply_tasks:
            if task.job_id == job_id:
                task.linkedin_connect_status = status
                updated = True
                break

        if not updated:
            return run

        await self.save(run)
        return run

    async def finalize_if_complete(self, workflow_id: str) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if (
            run is None
            or not run.apply_tasks
            or run.status in {WorkflowStatus.paused, WorkflowStatus.cancelled}
        ):
            return run

        if not all(task.status in TERMINAL_APPLY_STATUSES for task in run.apply_tasks):
            return run

        success_statuses = {"submitted", "already_applied"}
        if all(task.status in success_statuses for task in run.apply_tasks):
            run.status = WorkflowStatus.completed
        elif any(task.status in success_statuses for task in run.apply_tasks):
            run.status = WorkflowStatus.partial
        else:
            run.status = WorkflowStatus.partial

        await self.save(run)
        await self._sync_durable_status(workflow_id, run.status.value)
        return run

    async def mark_timed_out_tasks(self, workflow_id: str) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None or run.status in {WorkflowStatus.paused, WorkflowStatus.cancelled}:
            return run

        changed = False
        for task in run.apply_tasks:
            if task.status not in TERMINAL_APPLY_STATUSES:
                task.status = "timed_out"
                task.error_detail = "Apply result timeout exceeded"
                changed = True

        if not changed:
            return run

        run.status = WorkflowStatus.partial
        await self.save(run)
        await self._sync_durable_status(
            workflow_id,
            run.status.value,
            applications=[
                {
                    "jobId": task.job_id,
                    "status": task.status,
                    "errorDetail": task.error_detail,
                }
                for task in run.apply_tasks
                if task.status == "timed_out"
            ],
        )
        return run

    async def list_recent(self, limit: int = 20) -> list[str]:
        raw_ids = await self._redis.lrange(WORKFLOW_INDEX_KEY, 0, limit - 1)
        return [
            item.decode() if isinstance(item, bytes) else str(item) for item in raw_ids
        ]

    async def find_active_applying(self) -> list[str]:
        ids = await self.list_recent(limit=100)
        active: list[str] = []
        for workflow_id in ids:
            run = await self.get(workflow_id)
            if run is None:
                continue
            if run.status == WorkflowStatus.applying and run.apply_tasks:
                if any(
                    task.status not in TERMINAL_APPLY_STATUSES for task in run.apply_tasks
                ):
                    active.append(workflow_id)
        return active
