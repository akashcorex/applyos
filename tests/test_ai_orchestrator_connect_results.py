"""Tests for connect_result handling in the results consumer."""

import json
from unittest.mock import AsyncMock

import pytest

from models import (
    ApplyTaskRecord,
    CVData,
    StartWorkflowRequest,
    UserProfile,
    WorkflowStatus,
)
from services.results_consumer import ResultsConsumer
from services.workflow_store import WorkflowStore


class FakeRedis:
    def __init__(self) -> None:
        self.data: dict[str, str] = {}

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

    async def lpush(self, key: str, value: str) -> None:
        pass

    async def ltrim(self, key: str, start: int, end: int) -> None:
        pass

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        return []


@pytest.mark.asyncio
async def test_results_consumer_marks_login_required_when_session_missing() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)
    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=3,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
        auto_apply=True,
        post_apply_linkedin_connect=True,
    )
    await store.create("wf-login", request)
    run = await store.get("wf-login")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-login:a",
            job_title="Engineer",
            company_name="Acme",
            application_url="https://example.com/a",
            status="queued",
        )
    ]
    run.status = WorkflowStatus.applying
    await store.save(run)
    await store.index_job("wf-login", "wf-login:a")

    apply_client = AsyncMock()
    apply_client.linkedin_session_status = AsyncMock(
        return_value={
            "user_id": "user-1",
            "has_session": True,
            "linkedin_authenticated": False,
            "expires_in_seconds": 604800,
        }
    )
    consumer = ResultsConsumer(fake_redis, store, apply_client=apply_client)
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "apply_result",
                "data": {
                    "job_id": "wf-login:a",
                    "user_id": "user-1",
                    "status": "submitted",
                },
            }
        )
    )

    updated = await store.get("wf-login")
    assert updated is not None
    assert updated.apply_tasks[0].linkedin_connect_status == "login_required"
    apply_client.trigger_discover_connect.assert_not_awaited()


@pytest.mark.asyncio
async def test_results_consumer_handles_connect_result_sent() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)
    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=3,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
        auto_apply=True,
    )
    await store.create("wf-connect", request)
    run = await store.get("wf-connect")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-connect:a",
            job_title="Engineer",
            company_name="Acme",
            application_url="https://example.com/a",
            status="submitted",
            linkedin_connect_status="pending",
        )
    ]
    await store.save(run)
    await store.index_job("wf-connect", "wf-connect:a")

    consumer = ResultsConsumer(fake_redis, store, apply_client=AsyncMock())
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "connect_result",
                "data": {
                    "contact_id": "c1",
                    "user_id": "user-1",
                    "action": "connect",
                    "status": "sent",
                    "job_id": "wf-connect:a",
                },
            }
        )
    )

    updated = await store.get("wf-connect")
    assert updated is not None
    assert updated.apply_tasks[0].linkedin_connect_status == "sent"


@pytest.mark.asyncio
async def test_discover_connect_not_triggered_twice_for_duplicate_submitted() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)
    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=3,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
        auto_apply=True,
        post_apply_linkedin_connect=True,
    )
    await store.create("wf-dup", request)
    run = await store.get("wf-dup")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-dup:a",
            job_title="Engineer",
            company_name="Acme",
            application_url="https://example.com/a",
            status="queued",
        )
    ]
    run.status = WorkflowStatus.applying
    await store.save(run)
    await store.index_job("wf-dup", "wf-dup:a")

    apply_client = AsyncMock()
    apply_client.linkedin_session_status = AsyncMock(
        return_value={
            "user_id": "user-1",
            "has_session": True,
            "linkedin_authenticated": True,
            "expires_in_seconds": 604800,
        }
    )
    apply_client.trigger_discover_connect = AsyncMock(return_value={"task_id": "t1"})
    consumer = ResultsConsumer(fake_redis, store, apply_client=apply_client)
    payload = json.dumps(
        {
            "type": "apply_result",
            "data": {
                "job_id": "wf-dup:a",
                "user_id": "user-1",
                "status": "submitted",
            },
        }
    )
    await consumer.handle_message_for_test(payload)
    await consumer.handle_message_for_test(payload)

    assert apply_client.trigger_discover_connect.await_count == 1

