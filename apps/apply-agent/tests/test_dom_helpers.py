"""Tests for the shared DOM helpers."""

from __future__ import annotations

import pytest

from app.browser.dom import first_visible, safe_click


class FakeCandidate:
    def __init__(self, visible: bool, handle: object) -> None:
        self._visible = visible
        self._handle = handle

    async def is_visible(self) -> bool:
        return self._visible

    async def element_handle(self) -> object:
        return self._handle


class FakeLocator:
    def __init__(self, candidates: list[FakeCandidate]) -> None:
        self._candidates = candidates

    async def count(self) -> int:
        return len(self._candidates)

    def nth(self, index: int) -> FakeCandidate:
        return self._candidates[index]


class FakePage:
    def __init__(self, candidates: list[FakeCandidate], fallback: object = None) -> None:
        self._candidates = candidates
        self._fallback = fallback

    def locator(self, selector: str) -> FakeLocator:
        return FakeLocator(self._candidates)

    async def query_selector(self, selector: str) -> object:
        return self._fallback


@pytest.mark.asyncio
async def test_prefers_visible_duplicate() -> None:
    hidden, visible = object(), object()
    page = FakePage([FakeCandidate(False, hidden), FakeCandidate(True, visible)])

    assert await first_visible(page, "input[name='consent[marketing]']") is visible  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_falls_back_to_first_match_when_nothing_visible() -> None:
    hidden = object()
    page = FakePage([FakeCandidate(False, hidden)], fallback=hidden)

    assert await first_visible(page, "#x") is hidden  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_returns_none_when_selector_misses() -> None:
    page = FakePage([], fallback=None)

    assert await first_visible(page, "#missing") is None  # type: ignore[arg-type]


class FakeClickable:
    def __init__(self, fail_click: bool = False, fail_js: bool = False) -> None:
        self.fail_click = fail_click
        self.fail_js = fail_js
        self.js_clicked = False

    async def click(self, timeout: int | None = None, force: bool = False) -> None:
        if self.fail_click:
            raise TimeoutError("input dispatch stalled")

    async def evaluate(self, script: str) -> None:
        if self.fail_js:
            raise RuntimeError("no js")
        self.js_clicked = True


@pytest.mark.asyncio
async def test_safe_click_uses_native_click_when_it_works() -> None:
    element = FakeClickable()

    assert await safe_click(element) is True  # type: ignore[arg-type]
    assert element.js_clicked is False


@pytest.mark.asyncio
async def test_safe_click_falls_back_to_js_when_dispatch_stalls() -> None:
    element = FakeClickable(fail_click=True)

    assert await safe_click(element) is True  # type: ignore[arg-type]
    assert element.js_clicked is True


@pytest.mark.asyncio
async def test_safe_click_reports_failure_when_both_paths_fail() -> None:
    element = FakeClickable(fail_click=True, fail_js=True)

    assert await safe_click(element) is False  # type: ignore[arg-type]
