"""Tests for Lever radio/checkbox group matching."""

from __future__ import annotations

import pytest

from app.ats.lever import LeverHandler


class FakeOption:
    def __init__(self, value: str, text: str) -> None:
        self.value = value
        self.text = text
        self.checked = False

    async def evaluate(self, script: str) -> str:
        return self.text

    async def get_attribute(self, name: str) -> str | None:
        return self.value if name == "value" else None

    async def is_visible(self) -> bool:
        return True

    async def check(self, timeout: int | None = None) -> None:
        self.checked = True


class FakePage:
    def __init__(self, options: list[FakeOption]) -> None:
        self.options = options

    async def query_selector_all(self, selector: str) -> list[FakeOption]:
        return self.options


@pytest.mark.asyncio
async def test_radio_exact_match_selects_the_right_option() -> None:
    yes, no = FakeOption("Yes", "Yes"), FakeOption("No", "No")
    page = FakePage([yes, no])

    assert await LeverHandler()._fill_radio(page, "input[name='q']", "No") is True  # type: ignore[arg-type]
    assert no.checked is True
    assert yes.checked is False


@pytest.mark.asyncio
async def test_radio_matches_by_value_when_label_is_absent() -> None:
    yes, no = FakeOption("Yes", ""), FakeOption("No", "")
    page = FakePage([yes, no])

    assert await LeverHandler()._fill_radio(page, "input[name='q']", "No") is True  # type: ignore[arg-type]
    assert no.checked is True


@pytest.mark.asyncio
async def test_radio_rejects_answers_that_are_not_options() -> None:
    page = FakePage([FakeOption("Yes", "Yes"), FakeOption("No", "No")])

    assert await LeverHandler()._fill_radio(page, "input[name='q']", "Maybe") is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_checkbox_group_selects_matching_option() -> None:
    no, intern = FakeOption("No", "No"), FakeOption("Yes - Intern", "Yes - Intern")
    page = FakePage([no, intern])

    assert await LeverHandler()._fill_checkbox(page, "input[name='q']", "No") is True  # type: ignore[arg-type]
    assert no.checked is True
    assert intern.checked is False
