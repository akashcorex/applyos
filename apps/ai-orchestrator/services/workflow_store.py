"""Redis-backed workflow persistence."""

from __future__ import annotations

import json
from datetime import UTC, datetime

import redis.asyncio as redis

from config import settings
from models import (
    ApplyTaskRecord,
    DiscoveredJobRecord,
    StartWorkflowRequest,
    WorkflowRun,
    WorkflowStatus,
    TERMINAL_APPLY_STATUSES,
)

WORKFLOW_KEY_PREFIX = "workflow:"
JOB_INDEX_PREFIX = "job_index:"
WORKFLOW_INDEX_KEY = "workflow_ids"


class WorkflowStore:
    def __init__(self, client: redis.Redis) -> None:
        self._redis = client
        self._ttl = settings.workflow_ttl_seconds

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

    async def update_status(self, workflow_id: str, status: WorkflowStatus) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.status = status
        await self.save(run)

    async def append_error(self, workflow_id: str, message: str) -> None:
        run = await self.get(workflow_id)
        if run is None:
            return
        run.errors.append(message)
        await self.save(run)

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

    async def update_apply_task_status(
        self,
        workflow_id: str,
        job_id: str,
        status: str,
        error_detail: str | None = None,
    ) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None:
            return None

        updated = False
        for task in run.apply_tasks:
            if task.job_id == job_id:
                task.status = status
                task.error_detail = error_detail
                updated = True
                break

        if not updated:
            return run

        await self.save(run)
        return run

    async def finalize_if_complete(self, workflow_id: str) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None or not run.apply_tasks:
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
        return run

    async def mark_timed_out_tasks(self, workflow_id: str) -> WorkflowRun | None:
        run = await self.get(workflow_id)
        if run is None:
            return None

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
