from unittest.mock import AsyncMock, patch

import pytest

from app.ats.generic import GenericHandler
from app.llm.page_actor import PageAction
from app.models.job_payload import CVData


class _FakePage:
    url = "https://example.com/apply"

    def __init__(self) -> None:
        self.clicked: list[str] = []

    async def inner_text(self, _selector: str) -> str:
        return "Apply for Backend Engineer"

    async def evaluate(self, _script: str):
        return [
            {
                "id": "0",
                "tag": "button",
                "type": "submit",
                "text": "Submit application",
                "name": "",
                "href": "",
            }
        ]

    async def query_selector_all(self, _selector: str):
        return []

    async def wait_for_load_state(self, *_args, **_kwargs) -> None:
        return None


@pytest.mark.asyncio
async def test_generic_handler_done_on_thank_you() -> None:
    page = AsyncMock()
    page.url = "https://example.com/thanks"
    page.inner_text = AsyncMock(return_value="Thank you, application submitted")
    handler = GenericHandler()
    result = await handler.fill_and_submit(
        page,
        CVData(full_name="Jane Doe", email="jane@example.com"),
        {},
    )
    assert result.success is True
    assert result.ats_type == "generic"


@pytest.mark.asyncio
async def test_generic_handler_agentic_loop_submits(monkeypatch: pytest.MonkeyPatch) -> None:
    page = _FakePage()
    handler = GenericHandler()

    async def fake_choose(**_kwargs) -> PageAction:
        return PageAction(action="done", reason="submitted")

    monkeypatch.setattr("app.ats.generic.choose_next_action", fake_choose)
    monkeypatch.setattr("app.ats.generic.human_click", AsyncMock())
    monkeypatch.setattr("app.ats.generic.random_pause", AsyncMock())

    result = await handler.fill_and_submit(
        page,  # type: ignore[arg-type]
        CVData(full_name="Jane Doe", email="jane@example.com"),
        {},
    )
    assert result.success is True


@pytest.mark.asyncio
async def test_generic_handler_give_up() -> None:
    page = _FakePage()
    handler = GenericHandler()

    async def fake_choose(**_kwargs) -> PageAction:
        return PageAction(action="give_up", reason="login wall")

    with patch("app.ats.generic.choose_next_action", fake_choose):
        with patch("app.ats.generic.random_pause", AsyncMock()):
            result = await handler.fill_and_submit(
                page,  # type: ignore[arg-type]
                CVData(full_name="Jane Doe", email="jane@example.com"),
                {},
            )
    assert result.success is False
    assert "login wall" in (result.error or "")
