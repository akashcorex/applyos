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

# Keep UA aligned with a current Chrome major version for silent-pass.
_DEFAULT_VIEWPORT = {"width": 1440, "height": 900}
_CHROME_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


@asynccontextmanager
async def launch_browser(
    headless: bool | None = None,
) -> AsyncGenerator[Browser, None]:
    """Launch a stealth Chromium instance.

    When ``APPLY_HEADED=true``, runs headed Chrome (best for Lever hCaptcha
    silent-pass). Prefers installed Google Chrome via ``channel="chrome"``.
    """
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
    if settings.apply_use_chrome_channel:
        launch_kwargs["channel"] = "chrome"

    async with async_playwright() as pw:
        try:
            browser = await pw.chromium.launch(**launch_kwargs)
        except Exception as exc:
            if "channel" in launch_kwargs:
                logger.warning(
                    "Chrome channel launch failed (%s); falling back to bundled Chromium",
                    exc,
                )
                launch_kwargs.pop("channel", None)
                browser = await pw.chromium.launch(**launch_kwargs)
            else:
                raise
        logger.info(
            "Browser launched (headless=%s, channel=%s)",
            use_headless,
            launch_kwargs.get("channel", "chromium"),
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
    """Create a browser context with stealth and optional session restore."""
    context = await browser.new_context(
        viewport=_DEFAULT_VIEWPORT,
        user_agent=_CHROME_UA,
        locale="en-US",
        timezone_id="America/New_York",
        storage_state=storage_state,
        color_scheme="light",
        has_touch=False,
        java_script_enabled=True,
        extra_http_headers={
            "Accept-Language": "en-US,en;q=0.9",
        },
    )
    return context


async def new_stealth_page(context: BrowserContext) -> Page:
    """Open a new page inside *context* with stealth scripts injected."""
    page = await context.new_page()
    await _stealth.apply_stealth_async(page)
    # Extra hardening beyond playwright-stealth defaults.
    await page.add_init_script(
        """
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5],
        });
        window.chrome = window.chrome || { runtime: {} };
        """
    )
    return page
