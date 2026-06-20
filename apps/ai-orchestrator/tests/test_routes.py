from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from dependencies import AppState
from main import app
from models import CompanyTarget, CVData, StartWorkflowRequest, UserProfile


@pytest.fixture
def mock_app_state() -> AppState:
    state = AppState()
    state.redis = AsyncMock()
    state.redis.ping = AsyncMock()
    state.store = AsyncMock()
    state.results_consumer = AsyncMock()
    return state


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

    app.state.app_state = mock_app_state

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        with patch("routes.workflows.run_workflow", new=AsyncMock()):
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

    assert response.status_code == 202
    body = response.json()
    assert "workflow_id" in body
    assert body["status"] == "pending"
