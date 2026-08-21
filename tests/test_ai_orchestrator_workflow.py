import json
from unittest.mock import AsyncMock

import pytest

from models import (
    ApplyTaskRecord,
    CompanyTarget,
    CVData,
    StartWorkflowRequest,
    UserProfile,
    WorkflowStatus,
)
from services.results_consumer import ResultsConsumer
from services.workflow import run_workflow
from services.workflow_store import WorkflowStore


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

    async def lpush(self, key: str, value: str) -> None:
        self.lists.setdefault(key, [])
        self.lists[key].insert(0, value)

    async def ltrim(self, key: str, start: int, end: int) -> None:
        self.lists[key] = self.lists.get(key, [])[start : end + 1]

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        return self.lists.get(key, [])[start : end + 1]

    async def blpop(self, keys: list[str], timeout: int = 0):
        return None


def _sample_request(
    *,
    auto_apply: bool = False,
    post_apply_linkedin_connect: bool = False,
) -> StartWorkflowRequest:
    return StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=5,
            preferred_locations=["Remote"],
        ),
        cv_data=CVData(
            full_name="Jane",
            email="jane@example.com",
        ),
        targets=[
            CompanyTarget(
                company_name="Acme",
                ats_type="greenhouse",
                ats_slug="acme",
            )
        ],
        max_total_applies=1,
        auto_apply=auto_apply,
        post_apply_linkedin_connect=post_apply_linkedin_connect,
    )


@pytest.mark.asyncio
async def test_run_workflow_discover_only() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)

    class FakeJobClient:
        async def ingest_company(self, target: CompanyTarget):
            from models import DiscoveredJobRecord

            return [
                DiscoveredJobRecord(
                    external_id="1",
                    source="greenhouse",
                    title="Senior Engineer",
                    company_name=target.company_name,
                    location="Remote",
                    location_type="remote",
                    seniority="senior",
                    application_url="https://example.com/apply/1",
                    dedup_key="acme::senior engineer::remote",
                )
            ]

    await store.create("wf-1", _sample_request(auto_apply=False))
    await run_workflow("wf-1", _sample_request(auto_apply=False), store, FakeJobClient())

    run = await store.get("wf-1")
    assert run is not None
    assert run.status == WorkflowStatus.completed
    assert len(run.discovered_jobs) == 1


@pytest.mark.asyncio
async def test_results_consumer_updates_apply_task() -> None:
    fake_redis = FakeRedis()
    store = WorkflowStore(fake_redis)
    await store.create("wf-2", _sample_request(auto_apply=True, post_apply_linkedin_connect=True))
    run = await store.get("wf-2")
    assert run is not None
    run.apply_tasks = [
        ApplyTaskRecord(
            job_id="wf-2:acme::engineer",
            job_title="Engineer",
            company_name="Acme",
            application_url="https://example.com",
            status="queued",
        )
    ]
    run.status = WorkflowStatus.applying
    await store.save(run)
    await store.index_job("wf-2", "wf-2:acme::engineer")

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
    payload = json.dumps(
        {
            "type": "apply_result",
            "data": {
                "job_id": "wf-2:acme::engineer",
                "user_id": "user-1",
                "status": "submitted",
            },
        }
    )
    await consumer.handle_message_for_test(payload)

    updated = await store.get("wf-2")
    assert updated is not None
    assert updated.apply_tasks[0].status == "submitted"
    assert updated.status == WorkflowStatus.completed
    apply_client.trigger_discover_connect.assert_awaited_once()
