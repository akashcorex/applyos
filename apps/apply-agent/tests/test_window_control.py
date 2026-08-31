"""Tests for browser window control helpers."""

import pytest

from app.browser.window_control import minimize_browser_window, reveal_browser_window


class _FakePage:
    def __init__(self, *, closed: bool = False) -> None:
        self._closed = closed
        self.brought = False

    def is_closed(self) -> bool:
        return self._closed

    async def bring_to_front(self) -> None:
        self.brought = True


@pytest.mark.asyncio
async def test_reveal_closed_page_returns_false() -> None:
    assert await reveal_browser_window(_FakePage(closed=True)) is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_minimize_closed_page_returns_false() -> None:
    assert await minimize_browser_window(_FakePage(closed=True)) is False  # type: ignore[arg-type]
