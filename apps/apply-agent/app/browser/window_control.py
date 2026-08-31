"""CDP helpers to keep HITL Chrome in the background until needed."""

from __future__ import annotations

import logging

from playwright.async_api import Page

logger = logging.getLogger(__name__)


async def _window_id(page: Page) -> int | None:
    if page.is_closed():
        return None
    try:
        cdp = await page.context.new_cdp_session(page)
        result = await cdp.send("Browser.getWindowForTarget")
        window_id = result.get("windowId")
        await cdp.detach()
        return int(window_id) if window_id is not None else None
    except Exception:
        logger.exception("Failed to resolve browser window id")
        return None


async def minimize_browser_window(page: Page) -> bool:
    """Hide the headed Chrome window while the agent works in the background."""
    window_id = await _window_id(page)
    if window_id is None:
        return False
    try:
        cdp = await page.context.new_cdp_session(page)
        await cdp.send(
            "Browser.setWindowBounds",
            {"windowId": window_id, "bounds": {"windowState": "minimized"}},
        )
        await cdp.detach()
        return True
    except Exception:
        logger.exception("Failed to minimize browser window")
        return False


async def reveal_browser_window(page: Page) -> bool:
    """Restore + focus the headed Chrome window for human review."""
    if page.is_closed():
        return False
    window_id = await _window_id(page)
    try:
        if window_id is not None:
            cdp = await page.context.new_cdp_session(page)
            await cdp.send(
                "Browser.setWindowBounds",
                {"windowId": window_id, "bounds": {"windowState": "normal"}},
            )
            await cdp.detach()
        await page.bring_to_front()
        return True
    except Exception:
        logger.exception("Failed to reveal browser window")
        return False
