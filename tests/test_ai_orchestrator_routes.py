from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import AppState
from main import app
from models import CompanyTarget, CVData, DirectApplyJob, StartWorkflowRequest, UserProfile


@pytest.fixture
def mock_app_state(monkeypatch: pytest.MonkeyPatch) -> AppState:
    monkeypatch.setattr(
        "routes.workflows.settings.agent_service_token",
        "test-token",
    )
    state = AppState()
    state.redis = AsyncMock()
    state.redis.ping = AsyncMock()
    state.store = AsyncMock()
    state.results_consumer = AsyncMock()
    return state


@pytest.mark.asyncio
async def test_start_workflow_requires_service_token(mock_app_state: AppState) -> None:
    app.state.app_state = mock_app_state
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/workflows",
            json={
                "user_profile": {
                    "user_id": "u1",
                    "preferred_role": "Engineer",
                    "years_experience": 3,
                },
                "cv_data": {
                    "full_name": "Jane",
                    "email": "jane@example.com",
                },
                "targets": [
                    {
                        "company_name": "Acme",
                        "ats_type": "greenhouse",
                        "ats_slug": "acme",
                    }
                ],
                "auto_apply": False,
            },
        )

    assert response.status_code == 401


@pytest.mark.asyncio
async def test_start_workflow_returns_202(mock_app_state: AppState) -> None:
    from models import WorkflowRun, WorkflowStatus

    mock_app_state.store.create = AsyncMock(
        return_value=WorkflowRun(
            id="wf-test",
            status=WorkflowStatus.pending,
            request=StartWorkflowRequest(
                user_profile=UserProfile(
                    user_id="u1",
                    preferred_role="Engineer",
                    years_experience=3,
                ),
                cv_data=CVData(full_name="Jane", email="jane@example.com"),
                targets=[
                    CompanyTarget(
                        company_name="Acme",
                        ats_type="greenhouse",
                        ats_slug="acme",
                    )
                ],
            ),
        )
    )

    mock_app_state.start_workflow = AsyncMock()
    app.state.app_state = mock_app_state

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/workflows",
            headers={"X-Agent-Service-Token": "test-token"},
            json={
                "user_profile": {
                    "user_id": "u1",
                    "preferred_role": "Engineer",
                    "years_experience": 3,
                },
                "cv_data": {
                    "full_name": "Jane",
                    "email": "jane@example.com",
                },
                "targets": [
                    {
                        "company_name": "Acme",
                        "ats_type": "greenhouse",
                        "ats_slug": "acme",
                    }
                ],
                "auto_apply": False,
            },
        )

    assert response.status_code == 202
    body = response.json()
    assert "workflow_id" in body
    assert body["status"] == "pending"
    mock_app_state.start_workflow.assert_awaited_once()


def test_direct_apply_job_drops_unknown_source() -> None:
    job = DirectApplyJob.model_validate(
        {
            "title": "Design Engineer - Americas",
            "company_name": "Ashby",
            "application_url": "https://jobicy.com/jobs/156857-design-engineer-americas",
            "source": "feed",
            "dedup_key": "ashby::design engineer - americas::usa",
        }
    )
    assert job.source is None


def test_direct_apply_job_keeps_known_source() -> None:
    job = DirectApplyJob.model_validate(
        {
            "title": "Engineer",
            "company_name": "Acme",
            "application_url": "https://boards.greenhouse.io/acme/jobs/1",
            "source": "greenhouse",
        }
    )
    assert job.source == "greenhouse"


def test_start_workflow_request_accepts_feed_jobs() -> None:
    request = StartWorkflowRequest.model_validate(
        {
            "user_profile": {
                "user_id": "u1",
                "preferred_role": "Engineer",
                "years_experience": 3,
            },
            "cv_data": {
                "full_name": "Jane",
                "email": "jane@example.com",
                "resume_url": "http://127.0.0.1:8005/internal/resumes/r1/source",
            },
            "jobs": [
                {
                    "title": "Design Engineer - Americas",
                    "company_name": "Ashby",
                    "application_url": "https://jobicy.com/jobs/156857-design-engineer-americas",
                    "source": "feed",
                    "location": "USA",
                    "dedup_key": "ashby::design engineer - americas::usa",
                }
            ],
            "auto_apply": True,
        }
    )
    assert request.jobs[0].source is None
