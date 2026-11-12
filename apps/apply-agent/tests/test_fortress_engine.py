"""Tests for the Fortress engine backend and its stealth bypass."""

from __future__ import annotations

import pytest

from app.browser import engine, fortress
from app.config import settings


class FakePage:
    def __init__(self) -> None:
        self.init_scripts: list[str] = []

    async def add_init_script(self, script: str) -> None:
        self.init_scripts.append(script)


class FakeContext:
    def __init__(self) -> None:
        self.pages: list[FakePage] = []

    async def new_page(self) -> FakePage:
        page = FakePage()
        self.pages.append(page)
        return page


class FakeBrowser:
    version = "Chrome/153.0.0.0"

    def __init__(self) -> None:
        self.context_kwargs: dict = {}
        self.closed = False

    async def new_context(self, **kwargs: object) -> FakeContext:
        self.context_kwargs = kwargs
        return FakeContext()

    async def close(self) -> None:
        self.closed = True


def test_seed_for_is_stable_per_user() -> None:
    assert fortress.seed_for("user-123") == fortress.seed_for("user-123")


def test_seed_for_differs_between_users() -> None:
    assert fortress.seed_for("user-123") != fortress.seed_for("user-456")


def test_seed_for_unscoped_user_is_zero() -> None:
    assert fortress.seed_for(None) == 0


def test_build_args_carries_persona_and_headless(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fortress_country", "IN")
    args = fortress.build_args(
        "/opt/fortress/chrome", 9300, "/tmp/profile", "user-1", headless=True
    )

    assert "--headless=new" in args
    assert "--uxr-country=IN" in args
    assert f"--uxr-seed={fortress.seed_for('user-1')}" in args
    assert "--remote-debugging-port=9300" in args


def test_build_args_headed_omits_headless_flag() -> None:
    args = fortress.build_args("/opt/fortress/chrome", 9300, "/tmp/p", None, headless=False)

    assert "--headless=new" not in args
    assert not any(arg.startswith("--uxr-seed=") for arg in args)


@pytest.mark.asyncio
async def test_allocate_port_is_unique(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fortress_cdp_port_base", 19300)
    first = await fortress.allocate_port()
    second = await fortress.allocate_port()
    try:
        assert first != second
    finally:
        fortress.release_port(first)
        fortress.release_port(second)


def test_resolve_binary_reports_setup_hint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "fortress_chrome_bin", "/nonexistent/fortress/chrome")
    monkeypatch.chdir("/")

    with pytest.raises(RuntimeError, match="setup_fortress"):
        fortress.resolve_binary()
    assert fortress.is_available() is False


@pytest.mark.asyncio
async def test_create_context_defers_persona_to_fortress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(engine, "_last_launch_used_fortress", True)
    browser = FakeBrowser()

    await engine.create_context(browser, storage_state={"cookies": []})

    assert "locale" not in browser.context_kwargs
    assert "timezone_id" not in browser.context_kwargs
    assert "user_agent" not in browser.context_kwargs
    assert "extra_http_headers" not in browser.context_kwargs
    assert browser.context_kwargs["storage_state"] == {"cookies": []}


@pytest.mark.asyncio
async def test_create_context_keeps_overrides_on_playwright(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "apply_browser_engine", "playwright")
    monkeypatch.setattr(engine, "_last_launch_used_chrome_channel", True)
    browser = FakeBrowser()

    await engine.create_context(browser)

    assert browser.context_kwargs["locale"] == settings.apply_locale
    assert browser.context_kwargs["timezone_id"] == settings.apply_timezone


@pytest.mark.asyncio
async def test_new_stealth_page_skips_js_injection_on_fortress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(engine, "_last_launch_used_fortress", True)
    context = FakeContext()

    page = await engine.new_stealth_page(context)  # type: ignore[arg-type]

    assert page.init_scripts == []


class FakeSeat:
    def __init__(self) -> None:
        self.port = 19350
        self.cdp_url = "http://127.0.0.1:19350"
        self.stopped = False

    async def stop(self) -> None:
        self.stopped = True


class FakePlaywright:
    def __init__(self) -> None:
        self.connected_to: str | None = None
        self.browser = FakeBrowser()
        self.chromium = self

    async def connect_over_cdp(self, url: str) -> FakeBrowser:
        self.connected_to = url
        return self.browser

    async def __aenter__(self) -> "FakePlaywright":
        return self

    async def __aexit__(self, *exc: object) -> bool:
        return False


@pytest.mark.asyncio
async def test_launch_browser_fortress_connects_over_cdp_and_stops(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "apply_browser_engine", "fortress")
    seat = FakeSeat()
    pw = FakePlaywright()
    seen: dict = {}

    async def fake_start(user_id: str | None = None, headless: bool | None = None) -> FakeSeat:
        seen["user_id"] = user_id
        seen["headless"] = headless
        return seat

    monkeypatch.setattr(fortress, "is_available", lambda: True)
    monkeypatch.setattr(fortress, "start", fake_start)
    monkeypatch.setattr(engine, "async_playwright", lambda: pw)

    async with engine.launch_browser(headless=True, user_id="user-1") as browser:
        assert browser is pw.browser

    assert pw.connected_to == seat.cdp_url
    assert seen == {"user_id": "user-1", "headless": True}
    assert seat.stopped is True


@pytest.mark.asyncio
async def test_launch_browser_fortress_stops_seat_when_connect_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "apply_browser_engine", "fortress")
    seat = FakeSeat()
    pw = FakePlaywright()

    async def boom(url: str) -> FakeBrowser:
        raise RuntimeError("cdp unreachable")

    async def fake_start(user_id: str | None = None, headless: bool | None = None) -> FakeSeat:
        return seat

    monkeypatch.setattr(fortress, "is_available", lambda: True)
    monkeypatch.setattr(fortress, "start", fake_start)
    monkeypatch.setattr(engine, "async_playwright", lambda: pw)
    monkeypatch.setattr(pw, "connect_over_cdp", boom)

    with pytest.raises(RuntimeError, match="cdp unreachable"):
        async with engine.launch_browser(headless=True):
            pass

    assert seat.stopped is True


class FakeChromium:
    def __init__(self) -> None:
        self.browser = FakeBrowser()
        self.launch_kwargs: dict = {}

    async def launch(self, **kwargs: object) -> FakeBrowser:
        self.launch_kwargs = kwargs
        return self.browser


@pytest.mark.asyncio
async def test_launch_browser_falls_back_when_fortress_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "apply_browser_engine", "fortress")
    monkeypatch.setattr(settings, "apply_use_chrome_channel", False)
    monkeypatch.setattr(fortress, "is_available", lambda: False)

    async def fail_start(**kwargs: object) -> None:
        raise AssertionError("Fortress must not start when it is not installed")

    monkeypatch.setattr(fortress, "start", fail_start)

    chromium = FakeChromium()

    class FakePlaywright:
        def __init__(self) -> None:
            self.chromium = chromium

        async def __aenter__(self) -> "FakePlaywright":
            return self

        async def __aexit__(self, *exc: object) -> bool:
            return False

    monkeypatch.setattr(engine, "async_playwright", FakePlaywright)

    async with engine.launch_browser(headless=True) as browser:
        assert browser is chromium.browser

    assert chromium.launch_kwargs["headless"] is True
    assert engine._last_launch_used_fortress is False
    assert chromium.browser.closed is True
