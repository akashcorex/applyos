"""Playwright browser engine with anti-detection stealth."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from playwright.async_api import Browser, BrowserContext, Page, async_playwright
from playwright_stealth import Stealth

logger = logging.getLogger(__name__)

_stealth = Stealth()

# Realistic viewport dimensions to avoid fingerprinting
_DEFAULT_VIEWPORT = {"width": 1366, "height": 768}


@asynccontextmanager
async def launch_browser(
    headless: bool = True,
) -> AsyncGenerator[Browser, None]:
    """Launch a stealth Chromium instance.

    Usage::

        async with launch_browser() as browser:
            context = await create_context(browser)
            ...
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ],
        )
        logger.info("Browser launched (headless=%s)", headless)
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

    Args:
        browser: Running Playwright Browser instance.
        storage_state: Serialised cookies/localStorage to restore a
            previous session. Pass ``None`` for a fresh context.
    """
    context = await browser.new_context(
        viewport=_DEFAULT_VIEWPORT,
        user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
        locale="en-US",
        timezone_id="America/New_York",
        storage_state=storage_state,
    )
    return context


async def new_stealth_page(context: BrowserContext) -> Page:
    """Open a new page inside *context* with stealth scripts injected."""
    page = await context.new_page()
    await _stealth.apply_stealth_async(page)
    return page
