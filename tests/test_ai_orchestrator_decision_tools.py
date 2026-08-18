from unittest.mock import AsyncMock

import pytest

from models import CVData, DiscoveredJobRecord, StartRunRequest, TriggerApplyResponse, UserProfile
from services.decision.context import DecisionContext
from services.decision.graph import _run_deterministic
from services.decision.tools import build_tools


def _job() -> DiscoveredJobRecord:
    return DiscoveredJobRecord(
        external_id="1",
        source="greenhouse",
        title="Software Engineer",
        company_name="Acme",
        location="Remote",
        location_type="remote",
        seniority="mid",
        application_url="https://boards.greenhouse.io/acme/jobs/1",
        dedup_key="acme::software-engineer",
    )


@pytest.mark.asyncio
async def test_apply_tool_vetoes_without_resume_url() -> None:
    ctx = DecisionContext(
        workflow_id="wf-1",
        request=StartRunRequest(
            user_id="u1",
            job_role="Software Engineer",
            years_experience=4,
            resume_id="r1",
            max_applies=3,
        ),
        store=AsyncMock(),
        job_client=AsyncMock(),
        apply_client=AsyncMock(),
        resume_client=AsyncMock(),
        profile=UserProfile(
            user_id="u1",
            preferred_role="Software Engineer",
            years_experience=4,
        ),
        cv_data=CVData(full_name="Jane", email="jane@example.com"),
        candidates=[_job()],
    )
    tools = {tool.name: tool for tool in build_tools(ctx)}
    result = await tools["apply_to_job"].ainvoke(
        {
            "application_url": str(_job().application_url),
            "title": _job().title,
            "company_name": _job().company_name,
            "dedup_key": _job().dedup_key,
        }
    )
    assert "resume file is required" in result


@pytest.mark.asyncio
async def test_deterministic_run_applies_shortlist() -> None:
    job = _job()
    store = AsyncMock()
    apply_client = AsyncMock()
    apply_client.trigger_apply = AsyncMock(
        return_value=TriggerApplyResponse(task_id="t1", job_id="wf-1:acme::software-engineer")
    )
    job_client = AsyncMock()
    job_client.search_jobs = AsyncMock(return_value=[job])

    ctx = DecisionContext(
        workflow_id="wf-1",
        request=StartRunRequest(
            user_id="u1",
            job_role="Software Engineer",
            years_experience=4,
            resume_id="r1",
            max_applies=2,
        ),
        store=store,
        job_client=job_client,
        apply_client=apply_client,
        resume_client=AsyncMock(),
        profile=UserProfile(
            user_id="u1",
            preferred_role="Software Engineer",
            years_experience=4,
        ),
        cv_data=CVData(
            full_name="Jane",
            email="jane@example.com",
            resume_url="/tmp/resume.pdf",
            skills=["Python"],
        ),
    )
    store._redis = AsyncMock()
    store._redis.sadd = AsyncMock()
    store._redis.expire = AsyncMock()

    await _run_deterministic(ctx)

    apply_client.trigger_apply.assert_awaited()
    assert len(ctx.apply_tasks) == 1
    assert ctx.apply_tasks[0].status == "queued"


@pytest.mark.asyncio
async def test_detect_ats_tool_does_not_raise_on_502() -> None:
    import httpx

    ctx = DecisionContext(
        workflow_id="wf-1",
        request=StartRunRequest(
            user_id="u1",
            job_role="Software Engineer",
            years_experience=4,
            resume_id="r1",
            max_applies=3,
        ),
        store=AsyncMock(),
        job_client=AsyncMock(),
        apply_client=AsyncMock(),
        resume_client=AsyncMock(),
        profile=UserProfile(
            user_id="u1",
            preferred_role="Software Engineer",
            years_experience=4,
        ),
        cv_data=CVData(
            full_name="Jane",
            email="jane@example.com",
            resume_url="/tmp/resume.pdf",
        ),
        candidates=[_job()],
    )
    request = httpx.Request("POST", "http://127.0.0.1:8002/detect")
    response = httpx.Response(502, request=request)
    ctx.job_client.detect_ats = AsyncMock(
        side_effect=httpx.HTTPStatusError("502", request=request, response=response)
    )
    tools = {tool.name: tool for tool in build_tools(ctx)}
    result = await tools["detect_ats"].ainvoke(
        {"career_page_url": "https://careers.cloudflare.com"}
    )
    assert "detect failed" in result
    assert "skip this URL" in result
