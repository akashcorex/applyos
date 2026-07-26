"""Playwright browser engine with anti-detection stealth."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from playwright.async_api import Browser, BrowserContext, Page, async_playwright
from playwright_stealth import Stealth

from app.config import settings

logger = logging.getLogger(__name__)

_stealth = Stealth()

_DEFAULT_VIEWPORT = {"width": 1440, "height": 900}

# Set by launch_browser — create_context uses this to decide whether to override UA.
_last_launch_used_chrome_channel: bool = False

# Only used when falling back to bundled Chromium (no real Chrome channel).
# When channel="chrome", omit user_agent so Playwright uses Chrome's real UA —
# a stale hardcoded UA (e.g. Chrome/131) vs real Chrome 13x is a CF fingerprint miss.
_FALLBACK_CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


@asynccontextmanager
async def launch_browser(
    headless: bool | None = None,
) -> AsyncGenerator[Browser, None]:
    """Launch a stealth browser.

    When ``APPLY_HEADED=true``, runs headed Chrome (best for Lever hCaptcha
    silent-pass and Turnstile visibility). Prefers installed Google Chrome via
    ``channel="chrome"``.
    """
    global _last_launch_used_chrome_channel

    use_headless = (
        (not settings.apply_headed) if headless is None else headless
    )
    launch_kwargs: dict = {
        "headless": use_headless,
        "args": [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-infobars",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
        ],
    }
    want_chrome = settings.apply_use_chrome_channel
    if want_chrome:
        launch_kwargs["channel"] = "chrome"

    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(**launch_kwargs)
            _last_launch_used_chrome_channel = "channel" in launch_kwargs
        except Exception as exc:
            if "channel" in launch_kwargs:
                logger.warning(
                    "Chrome channel launch failed (%s); falling back to bundled Chromium",
                    exc,
                )
                launch_kwargs.pop("channel", None)
                browser = await pw.chromium.launch(**launch_kwargs)
                _last_launch_used_chrome_channel = False
            else:
                raise
        logger.info(
            "Browser launched (headless=%s, channel=%s, version=%s)",
            use_headless,
            "chrome" if _last_launch_used_chrome_channel else "chromium",
            browser.version,
        )
        try:
            yield browser
        finally:
            await browser.close()
            logger.info("Browser closed")


async def create_context(
    browser: Browser,
    storage_state: dict | None = None,
) -> BrowserContext:
    """Create a browser context with stealth and optional session restore.

    Cookies from prior applies (including ``cf_clearance`` when issued) come
    back via Redis ``storage_state``. Do not override the real Chrome UA when
    using the Chrome channel — mismatched UA/version is a common CF signal.
    """
    context_kwargs: dict = {
        "viewport": _DEFAULT_VIEWPORT,
        "locale": settings.apply_locale,
        "timezone_id": settings.apply_timezone,
        "storage_state": storage_state,
        "color_scheme": "light",
        "has_touch": False,
        "java_script_enabled": True,
        "extra_http_headers": {
            "Accept-Language": "en-US,en;q=0.9",
        },
    }
    if _last_launch_used_chrome_channel:
        logger.info(
            "Using native Chrome user-agent (browser.version=%s)", browser.version
        )
    else:
        context_kwargs["user_agent"] = _FALLBACK_CHROME_UA

    return await browser.new_context(**context_kwargs)


async def new_stealth_page(context: BrowserContext) -> Page:
    """Open a new page inside *context* with stealth scripts injected."""
    page = await context.new_page()
    await _stealth.apply_stealth_async(page)
    # Extra hardening beyond playwright-stealth defaults.
    await page.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en'],
        });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        window.chrome = window.chrome || { runtime: {} };
        """
    )
    return page
