from __future__ import annotations

import pytest
from fastapi import HTTPException

from models import ResumeRecord
from routes.resume import _callback_api, _extraction_payload, _fail_code_for


def test_extraction_payload_strips_internals() -> None:
    record = ResumeRecord(
        user_id="user-1",
        full_name="Ada Lovelace",
        email="ada@example.com",
        skills=["Mathematics"],
        education=[],
        work_history=[],
        raw_text="secret source",
        profile_embedding=[0.1, 0.2],
        profile_text_hash="abc",
    )
    payload = _extraction_payload(record)
    assert payload["full_name"] == "Ada Lovelace"
    assert payload["email"] == "ada@example.com"
    assert "raw_text" not in payload
    assert "profile_embedding" not in payload
    assert "profile_text_hash" not in payload


def test_fail_code_mapping() -> None:
    assert (
        _fail_code_for(HTTPException(status_code=400, detail="empty"))
        == "EMPTY_FILE"
    )
    assert (
        _fail_code_for(HTTPException(status_code=415, detail="bad type"))
        == "UNSUPPORTED_TYPE"
    )
    assert (
        _fail_code_for(
            HTTPException(status_code=422, detail="No extractable text found")
        )
        == "NO_TEXT"
    )
    assert (
        _fail_code_for(HTTPException(status_code=422, detail="parse boom"))
        == "PARSE_FAILED"
    )
    assert (
        _fail_code_for(HTTPException(status_code=502, detail="llm"))
        == "EXTRACTION_FAILED"
    )


@pytest.mark.asyncio
async def test_callback_api_posts_complete(monkeypatch) -> None:
    from config import settings

    monkeypatch.setattr(settings, "agent_service_token", "test-token")
    monkeypatch.setattr(settings, "api_url", "http://api.test")

    calls: list[tuple[str, dict, dict]] = []

    class _Response:
        def raise_for_status(self) -> None:
            return None

    class _Client:
        def __init__(self, *args, **kwargs) -> None:
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, json=None, headers=None):
            calls.append((url, json, headers))
            return _Response()

    monkeypatch.setattr("routes.resume.httpx.AsyncClient", _Client)

    await _callback_api(
        "file-1",
        complete={
            "extraction": {"full_name": "Ada", "email": "ada@example.com"},
            "resumeId": "11111111-1111-4111-8111-111111111111",
        },
    )

    assert len(calls) == 1
    url, payload, headers = calls[0]
    assert url.endswith("/v1/resumes/internal/file-1/complete")
    assert headers["X-Agent-Service-Token"] == "test-token"
    assert payload["resumeId"].startswith("11111111")
