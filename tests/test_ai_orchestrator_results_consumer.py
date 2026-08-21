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
        self.streams: dict[str, list[dict]] = {}

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

    async def xadd(self, stream: str, fields: dict) -> str:
        self.streams.setdefault(stream, []).append(fields)
        return "1-1"


@pytest.mark.asyncio
async def test_results_consumer_ignores_non_apply_events() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)
    consumer = ResultsConsumer(fake_redis, store, apply_client=AsyncMock())
    await consumer.handle_message_for_test(json.dumps({"type": "other", "data": {}}))


@pytest.mark.asyncio
async def test_results_consumer_finalizes_partial_workflow() -> None:
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
    await store.create("wf-3", request)
    run = await store.get("wf-3")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-3:a",
            job_title="A",
            company_name="Acme",
            application_url="https://example.com/a",
            status="queued",
        ),
        ApplyTaskRecord(
            job_id="wf-3:b",
            job_title="B",
            company_name="Acme",
            application_url="https://example.com/b",
            status="queued",
        ),
    ]
    run.status = WorkflowStatus.applying
    await store.save(run)
    await store.index_job("wf-3", "wf-3:a")
    await store.index_job("wf-3", "wf-3:b")

    apply_client = AsyncMock()
    apply_client.linkedin_session_status = AsyncMock(
        return_value={
            "user_id": "user-1",
            "has_session": True,
            "linkedin_authenticated": True,
            "expires_in_seconds": 604800,
        }
    )
    consumer = ResultsConsumer(fake_redis, store, apply_client=apply_client)
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "apply_result",
                "data": {
                    "job_id": "wf-3:a",
                    "user_id": "user-1",
                    "status": "submitted",
                },
            }
        )
    )
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "apply_result",
                "data": {
                    "job_id": "wf-3:b",
                    "user_id": "user-1",
                    "status": "failed",
                    "error_detail": "form error",
                },
            }
        )
    )

    updated = await store.get("wf-3")
    assert updated is not None
    assert updated.status == WorkflowStatus.partial
    apply_client.trigger_discover_connect.assert_awaited_once()
    call_kwargs = apply_client.trigger_discover_connect.await_args.kwargs
    assert call_kwargs["company_name"] == "Acme"
    assert call_kwargs["job_id"] == "wf-3:a"
    assert call_kwargs["delay_seconds"] == 900


@pytest.mark.asyncio
async def test_results_consumer_skips_linkedin_connect_without_opt_in() -> None:
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
    await store.create("wf-opt-in", request)
    run = await store.get("wf-opt-in")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-opt-in:a",
            job_title="A",
            company_name="Acme",
            application_url="https://example.com/a",
            status="queued",
        )
    ]
    run.status = WorkflowStatus.applying
    await store.save(run)
    await store.index_job("wf-opt-in", "wf-opt-in:a")

    apply_client = AsyncMock()
    consumer = ResultsConsumer(fake_redis, store, apply_client=apply_client)
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "apply_result",
                "data": {
                    "job_id": "wf-opt-in:a",
                    "user_id": "user-1",
                    "status": "submitted",
                },
            }
        )
    )

    apply_client.trigger_discover_connect.assert_not_awaited()


@pytest.mark.asyncio
async def test_results_consumer_requeues_result_arriving_before_task_row() -> None:
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
    await store.create("wf-race", request)
    await store.index_job("wf-race", "wf-race:a")

    consumer = ResultsConsumer(fake_redis, store, apply_client=AsyncMock())
    await consumer.handle_message_for_test(
        json.dumps(
            {
                "type": "apply_result",
                "data": {
                    "job_id": "wf-race:a",
                    "user_id": "user-1",
                    "status": "submitted",
                },
            }
        )
    )

    assert fake_redis.streams.get("results_stream")
    payload = fake_redis.streams["results_stream"][0]["payload"]
    assert json.loads(payload)["_delivery_attempt"] == 1
