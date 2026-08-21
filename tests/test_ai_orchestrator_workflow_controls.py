from __future__ import annotations

import pytest

from models import (
    ApplyTaskRecord,
    CVData,
    StartWorkflowRequest,
    UserProfile,
    WorkflowStatus,
)
from services.workflow_store import WorkflowStore


class _FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    async def get(self, key: str) -> str | None:
        return self.data.get(key)

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.data[key] = value

    async def lpush(self, key: str, value: str) -> None:
        self.lists.setdefault(key, []).insert(0, value)

    async def ltrim(self, key: str, start: int, end: int) -> None:
        self.lists[key] = self.lists.get(key, [])[start : end + 1]


def _request() -> StartWorkflowRequest:
    return StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=5,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
    )


@pytest.mark.asyncio
async def test_graph_status_updates_do_not_overwrite_pause_or_stop() -> None:
    store = WorkflowStore(_FakeRedis())
    await store.create("wf-controls", _request())

    assert await store.update_status("wf-controls", WorkflowStatus.paused)
    assert not await store.update_status("wf-controls", WorkflowStatus.applying)
    paused = await store.get("wf-controls")
    assert paused is not None
    assert paused.status == WorkflowStatus.paused

    assert await store.update_status(
        "wf-controls",
        WorkflowStatus.applying,
        allow_resume=True,
    )
    assert await store.update_status("wf-controls", WorkflowStatus.cancelled)
    assert not await store.update_status("wf-controls", WorkflowStatus.failed)
    stopped = await store.get("wf-controls")
    assert stopped is not None
    assert stopped.status == WorkflowStatus.cancelled


@pytest.mark.asyncio
async def test_retry_replaces_only_the_expected_terminal_apply_task() -> None:
    store = WorkflowStore(_FakeRedis())
    await store.create("wf-retry", _request())
    await store.set_apply_tasks(
        "wf-retry",
        [
            ApplyTaskRecord(
                job_id="wf-retry:acme:1",
                job_title="Engineer",
                company_name="Acme",
                application_url="https://example.com/apply",
                task_id="old-task",
                status="failed",
                error_detail="Temporary failure",
            )
        ],
    )
    await store.update_status("wf-retry", WorkflowStatus.partial)

    run = await store.get("wf-retry")
    assert run is not None
    requeued = await store.requeue_apply_task(
        "wf-retry",
        "wf-retry:acme:1",
        "new-task",
        expected_status="failed",
        expected_task_id="old-task",
        expected_workflow_status=WorkflowStatus.partial,
    )

    assert requeued is not None
    assert requeued.status == WorkflowStatus.applying
    assert requeued.apply_tasks[0].task_id == "new-task"
    assert requeued.apply_tasks[0].status == "queued"
    assert requeued.apply_tasks[0].error_detail is None

    assert (
        await store.requeue_apply_task(
            "wf-retry",
            "wf-retry:acme:1",
            "third-task",
            expected_status="failed",
            expected_task_id="old-task",
            expected_workflow_status=WorkflowStatus.partial,
        )
        is None
    )
