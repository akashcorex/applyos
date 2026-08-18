from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import AppState
from main import app
from models import CVData, StartWorkflowRequest, UserProfile, WorkflowRun, WorkflowStatus


@pytest.fixture
def mock_app_state() -> AppState:
    state = AppState()
    state.redis = AsyncMock()
    state.store = AsyncMock()
    state.results_consumer = AsyncMock()
    return state


@pytest.mark.asyncio
async def test_start_run_returns_202(mock_app_state: AppState) -> None:
    mock_app_state.store.create = AsyncMock(
        return_value=WorkflowRun(
            id="run-test",
            status=WorkflowStatus.pending,
            request=StartWorkflowRequest(
                user_profile=UserProfile(
                    user_id="u1",
                    preferred_role="Engineer",
                    years_experience=4,
                ),
                cv_data=CVData(full_name="Jane", email="jane@example.com"),
                auto_apply=False,
            ),
        )
    )
    app.state.app_state = mock_app_state

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("routes.runs.run_decision", new=AsyncMock()):
            response = await client.post(
                "/runs",
                json={
                    "user_id": "u1",
                    "job_role": "Backend Engineer",
                    "years_experience": 4,
                    "resume_id": "resume-1",
                    "max_applies": 3,
                },
            )

    assert response.status_code == 202
    body = response.json()
    assert "workflow_id" in body
    assert body["status"] == "pending"
    mock_app_state.store.create.assert_awaited()
