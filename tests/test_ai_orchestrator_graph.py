from __future__ import annotations

import pytest

from models import (
    CompanyTarget,
    CVData,
    StartWorkflowRequest,
    UserProfile,
    WorkflowStatus,
)
from services.graph import run_workflow_graph
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
        self.lists.setdefault(key, [])
        self.lists[key].insert(0, value)

    async def ltrim(self, key: str, start: int, end: int) -> None:
        self.lists[key] = self.lists.get(key, [])[start : end + 1]

    async def lrange(self, key: str, start: int, end: int) -> list[str]:
        return self.lists.get(key, [])[start : end + 1]

    async def blpop(self, keys: list[str], timeout: int = 0):
        return None


def _sample_request(*, auto_apply: bool = False) -> StartWorkflowRequest:
    return StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=5,
            preferred_locations=["Remote"],
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[
            CompanyTarget(
                company_name="Acme",
                ats_type="greenhouse",
                ats_slug="acme",
            )
        ],
        max_total_applies=1,
        auto_apply=auto_apply,
    )


@pytest.mark.asyncio
async def test_graph_workflow_discover_only() -> None:
    """Graph-based workflow with auto_apply=False reaches 'completed'."""
    fake_redis = _FakeRedis()
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

    await store.create("wf-graph-1", _sample_request(auto_apply=False))
    await run_workflow_graph(
        "wf-graph-1", _sample_request(auto_apply=False), store, FakeJobClient()
    )

    run = await store.get("wf-graph-1")
    assert run is not None
    assert run.status == WorkflowStatus.completed
    assert len(run.discovered_jobs) == 1


@pytest.mark.asyncio
async def test_graph_workflow_no_targets_completes() -> None:
    """Graph-based workflow with empty targets and no funding completes."""
    fake_redis = _FakeRedis()
    store = WorkflowStore(fake_redis)

    class FakeFundingClient:
        async def resolve_targets(self, *args, **kwargs):
            return []

    class FakeJobClient:
        async def ingest_company(self, target):
            return []

    request = StartWorkflowRequest(
        user_profile=UserProfile(
            user_id="user-1",
            preferred_role="Engineer",
            years_experience=5,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        targets=[],
    )

    await store.create("wf-graph-2", request)
    await run_workflow_graph(
        "wf-graph-2", request, store, FakeJobClient(), funding_client=FakeFundingClient()
    )

    run = await store.get("wf-graph-2")
    assert run is not None
    assert run.status == WorkflowStatus.completed
