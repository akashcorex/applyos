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

    async def new_context(self, **kwargs: object) -> FakeContext:
        self.context_kwargs = kwargs
        return FakeContext()


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


@pytest.mark.asyncio
async def test_create_context_defers_persona_to_fortress(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "apply_browser_engine", "fortress")
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
    monkeypatch.setattr(settings, "apply_browser_engine", "fortress")
    context = FakeContext()

    page = await engine.new_stealth_page(context)  # type: ignore[arg-type]

    assert page.init_scripts == []
