"""Tests for CAPTCHA detection vs invisible widgets on normal forms."""

from __future__ import annotations

import pytest

from app.browser import blocker_detector
from app.browser.captcha import detect_captcha, detect_visible_captcha


class FakeElement:
    def __init__(self, visible: bool, src: str = "") -> None:
        self._visible = visible
        self._src = src

    async def is_visible(self) -> bool:
        return self._visible

    async def get_attribute(self, name: str) -> str | None:
        return self._src if name == "src" else None


class FakePage:
    def __init__(self, mapping: dict[str, FakeElement | None]) -> None:
        self.mapping = mapping
        self.url = "https://job-boards.greenhouse.io/acme/jobs/1"

    async def query_selector(self, selector: str) -> FakeElement | None:
        return self.mapping.get(selector)

    async def evaluate(self, script: str) -> str:
        return ""


INVISIBLE_RECAPTCHA = (
    "https://www.recaptcha.net/recaptcha/enterprise/anchor"
    "?ar=1&k=6LfmcbcpAAAA&co=aHR0cHM6&hl=en&size=invisible&cb=abc"
)
VISIBLE_RECAPTCHA = "https://www.google.com/recaptcha/api2/anchor?k=abc"


@pytest.mark.asyncio
async def test_invisible_recaptcha_is_not_a_visible_captcha() -> None:
    page = FakePage({"iframe[src*='recaptcha']": FakeElement(False, INVISIBLE_RECAPTCHA)})

    assert await detect_visible_captcha(page) is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_invisible_recaptcha_still_counts_for_solver_path() -> None:
    page = FakePage({"iframe[src*='recaptcha']": FakeElement(False, INVISIBLE_RECAPTCHA)})

    assert await detect_captcha(page) is True  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_visible_recaptcha_is_a_visible_captcha() -> None:
    page = FakePage({"iframe[src*='recaptcha']": FakeElement(True, VISIBLE_RECAPTCHA)})

    assert await detect_visible_captcha(page) is True  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_hidden_widget_without_size_param_is_ignored() -> None:
    page = FakePage({"div.g-recaptcha": FakeElement(False, "")})

    assert await detect_visible_captcha(page) is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_no_captcha_present() -> None:
    assert await detect_visible_captcha(FakePage({})) is False  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_blocker_detector_ignores_invisible_recaptcha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_turnstile(page: object) -> bool:
        return False

    monkeypatch.setattr(blocker_detector, "detect_turnstile", no_turnstile)
    page = FakePage({"iframe[src*='recaptcha']": FakeElement(False, INVISIBLE_RECAPTCHA)})

    assert await blocker_detector.detect_blocker(page) is None  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_blocker_detector_flags_visible_captcha(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def no_turnstile(page: object) -> bool:
        return False

    monkeypatch.setattr(blocker_detector, "detect_turnstile", no_turnstile)
    page = FakePage({"iframe[src*='recaptcha']": FakeElement(True, VISIBLE_RECAPTCHA)})

    blocker = await blocker_detector.detect_blocker(page)  # type: ignore[arg-type]

    assert blocker is not None
    assert blocker.type == "CAPTCHA"
