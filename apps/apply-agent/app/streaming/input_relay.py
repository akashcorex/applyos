"""Relay user input from the frontend to Playwright."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Page

from app.browser.session_registry import ControlMode

logger = logging.getLogger(__name__)

_VIEWPORT_WIDTH = 1440
_VIEWPORT_HEIGHT = 900


def _parse_coord(value: Any, fallback: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def map_click_to_page(
    x: Any,
    y: Any,
    *,
    display_width: Any,
    display_height: Any,
    page_width: float = _VIEWPORT_WIDTH,
    page_height: float = _VIEWPORT_HEIGHT,
) -> tuple[float, float]:
    """Map a click on the displayed canvas to Playwright page coordinates."""
    raw_x = _parse_coord(x, 0.0)
    raw_y = _parse_coord(y, 0.0)
    width = _parse_coord(display_width, page_width)
    height = _parse_coord(display_height, page_height)

    # Coordinates already in page/canvas pixel space (preferred path from frontend).
    if width == page_width and height == page_height:
        return raw_x, raw_y

    if width <= 0 or height <= 0:
        return raw_x, raw_y

    return (
        raw_x * (page_width / width),
        raw_y * (page_height / height),
    )


async def relay_input(
    page: Page,
    message: dict[str, Any],
    *,
    control_mode: ControlMode,
) -> None:
    """Apply a user input event to the page when in human control mode."""
    if control_mode != ControlMode.HUMAN:
        return

    event_type = message.get("type")
    if event_type == "click":
        page_x, page_y = map_click_to_page(
            message.get("x"),
            message.get("y"),
            display_width=message.get("viewportWidth", _VIEWPORT_WIDTH),
            display_height=message.get("viewportHeight", _VIEWPORT_HEIGHT),
        )
        await page.mouse.click(page_x, page_y)
    elif event_type == "mousemove":
        page_x, page_y = map_click_to_page(
            message.get("x"),
            message.get("y"),
            display_width=message.get("viewportWidth", _VIEWPORT_WIDTH),
            display_height=message.get("viewportHeight", _VIEWPORT_HEIGHT),
        )
        await page.mouse.move(page_x, page_y)
    elif event_type == "scroll":
        delta_y = float(message.get("deltaY", 0))
        await page.mouse.wheel(0, delta_y)
    elif event_type == "keydown":
        key = message.get("key")
        if isinstance(key, str) and key:
            await page.keyboard.press(key)
    elif event_type == "type":
        text = message.get("text")
        if isinstance(text, str) and text:
            await page.keyboard.type(text)
    else:
        logger.debug("Ignoring unknown input event type=%s", event_type)
