from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from models import (
    ApplyTaskRecord,
    CVData,
    StartWorkflowRequest,
    UserProfile,
    WorkflowStatus,
)
from services.durable_worker import (
    LOCK_KEY_PREFIX,
    DurableWorkflowWorker,
    encode_dispatch,
    parse_dispatch,
)
from services.workflow_store import WorkflowStore


def test_dispatch_round_trip() -> None:
    raw = encode_dispatch("workflow", "wf-123")
    assert parse_dispatch(raw) == ("workflow", "wf-123")


def test_parse_legacy_plain_workflow_id() -> None:
    assert parse_dispatch("wf-legacy") == ("workflow", "wf-legacy")


def test_parse_decision_prefix() -> None:
    assert parse_dispatch("decision:wf-9") == ("decision", "wf-9")


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}
        self.lists: dict[str, list[str]] = {}

    async def get(self, key: str) -> str | None:
        return self.data.get(key)

    async def set(
        self,
        key: str,
        value: str,
        ex: int | None = None,
        nx: bool = False,
    ) -> bool | None:
        if nx and key in self.data:
            return None
        self.data[key] = value
        return True

    async def delete(self, key: str) -> int:
        existed = 1 if key in self.data else 0
        self.data.pop(key, None)
        return existed

    async def expire(self, key: str, seconds: int) -> bool:
        return key in self.data

    async def lpush(self, key: str, value: str) -> int:
        self.lists.setdefault(key, []).insert(0, value)
        return len(self.lists[key])

    async def ltrim(self, key: str, start: int, end: int) -> bool:
        items = self.lists.get(key, [])
        if end == -1:
            end = len(items) - 1
        self.lists[key] = items[start : end + 1]
        return True

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        items = self.lists.get(key, [])
        if end == -1:
            end = len(items) - 1
        return items[start : end + 1]

    async def lrem(self, key: str, count: int, value: str) -> int:
        items = self.lists.get(key, [])
        removed = 0
        if count == 0:
            while value in items:
                items.remove(value)
                removed += 1
        elif count > 0:
            while removed < count and value in items:
                items.remove(value)
                removed += 1
        self.lists[key] = items
        return removed

    async def rpoplpush(self, src: str, dst: str) -> str | None:
        items = self.lists.get(src, [])
        if not items:
            return None
        value = items.pop()
        self.lists.setdefault(dst, []).insert(0, value)
        return value

    async def brpoplpush(self, src: str, dst: str, timeout: int = 0) -> str | None:
        return await self.rpoplpush(src, dst)


@pytest.mark.asyncio
async def test_recover_does_not_steal_locked_run() -> None:
    redis = FakeRedis()
    store = WorkflowStore(redis)
    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="u1",
            preferred_role="Engineer",
            years_experience=3,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
        auto_apply=False,
    )
    await store.create("wf-locked", request)
    run = await store.get("wf-locked")
    assert run is not None
    run.status = WorkflowStatus.applying
    await store.save(run)

    item = encode_dispatch("workflow", "wf-locked")
    redis.lists["orchestrator_processing_queue"] = [item]
    redis.data[f"{LOCK_KEY_PREFIX}wf-locked"] = "other-host:1"

    worker = DurableWorkflowWorker(redis, store, worker_id="this-host:2")
    await worker.recover()

    assert redis.lists.get("orchestrator_processing_queue") == [item]
    assert redis.lists.get("orchestrator_dispatch_queue", []) == []


@pytest.mark.asyncio
async def test_upsert_apply_task_does_not_clobber_submitted() -> None:
    redis = FakeRedis()
    store = WorkflowStore(redis)
    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="u1",
            preferred_role="Engineer",
            years_experience=3,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
        auto_apply=True,
    )
    await store.create("wf-up", request)
    submitted = ApplyTaskRecord(
        job_id="wf-up:a",
        job_title="Engineer",
        company_name="Acme",
        application_url="https://example.com/a",
        status="submitted",
        task_id="celery-1",
    )
    await store.upsert_apply_task("wf-up", submitted)

    failed_rewrite = ApplyTaskRecord(
        job_id="wf-up:a",
        job_title="Engineer",
        company_name="Acme",
        application_url="https://example.com/a",
        status="failed",
        error_detail="Apply trigger failed",
    )
    await store.upsert_apply_task("wf-up", failed_rewrite)

    run = await store.get("wf-up")
    assert run is not None
    assert run.apply_tasks[0].status == "submitted"
    assert run.apply_tasks[0].task_id == "celery-1"
