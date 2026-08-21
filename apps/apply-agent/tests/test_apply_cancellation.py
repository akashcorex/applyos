from unittest.mock import AsyncMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.models.job_payload import CVData, JobPayload, UserProfile
from app.routers import admin
from app.workers import apply_worker


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(admin.router)
    return TestClient(app)


def test_cancel_apply_task_requires_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin.settings, "agent_service_token", "test-token")
    marker = AsyncMock()
    monkeypatch.setattr(admin, "mark_apply_task_cancelled", marker)

    response = _client().post("/admin/tasks/task-123/cancel")

    assert response.status_code == 401
    marker.assert_not_awaited()


def test_trigger_apply_requires_service_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin.settings, "agent_service_token", "test-token")
    delay = Mock()
    monkeypatch.setattr(admin.apply_job, "delay", delay)

    response = _client().post(
        "/admin/trigger/apply",
        json={
            "job_id": "wf:job",
            "job_url": "https://example.com/jobs/1",
            "company_name": "Acme",
            "cv_data": {"full_name": "Jane", "email": "jane@example.com"},
            "user_profile": {
                "user_id": "u1",
                "preferred_role": "Engineer",
                "years_experience": 3,
            },
        },
    )

    assert response.status_code == 401
    delay.assert_not_called()


def test_cancel_apply_task_marks_and_revokes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(admin.settings, "agent_service_token", "test-token")
    marker = AsyncMock()
    revoke = Mock()
    monkeypatch.setattr(admin, "mark_apply_task_cancelled", marker)
    monkeypatch.setattr(admin.celery_app.control, "revoke", revoke)

    response = _client().post(
        "/admin/tasks/task-123/cancel",
        headers={"X-Agent-Service-Token": "test-token"},
    )

    assert response.status_code == 202
    assert response.json() == {
        "task_id": "task-123",
        "status": "cancellation_requested",
    }
    marker.assert_awaited_once_with("task-123")
    revoke.assert_called_once_with("task-123", terminate=False)


@pytest.mark.asyncio
async def test_worker_stops_before_browser_launch_when_cancelled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = JobPayload(
        job_id="job-123",
        job_url="https://example.com/jobs/123",
        company_name="Example",
        cv_data=CVData(full_name="Jane Doe", email="jane@example.com"),
        user_profile=UserProfile(
            user_id="user-123",
            preferred_role="Engineer",
            years_experience=3,
        ),
    )
    cancelled = AsyncMock(return_value=True)
    launch_browser = Mock()
    monkeypatch.setattr(apply_worker, "is_apply_task_cancelled", cancelled)
    monkeypatch.setattr(apply_worker, "launch_browser", launch_browser)

    with pytest.raises(apply_worker.ApplyTaskCancelled):
        await apply_worker._run_apply(payload, "task-123")

    cancelled.assert_awaited_once_with("task-123")
    launch_browser.assert_not_called()
