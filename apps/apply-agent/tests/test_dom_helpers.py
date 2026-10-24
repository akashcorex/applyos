"""Tests for the shared DOM helpers."""

from __future__ import annotations

import pytest

from app.browser.dom import first_visible


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
