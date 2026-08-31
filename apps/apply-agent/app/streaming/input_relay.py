"""Relay user input from the frontend to Playwright."""

from __future__ import annotations

import logging
from typing import Any

from playwright.async_api import Page

from app.browser.session_registry import ControlMode

logger = logging.getLogger(__name__)

_VIEWPORT_WIDTH = 1440
_VIEWPORT_HEIGHT = 900


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
        x = _scale_coord(message.get("x"), message.get("viewportWidth", _VIEWPORT_WIDTH))
        y = _scale_coord(message.get("y"), message.get("viewportHeight", _VIEWPORT_HEIGHT))
        await page.mouse.click(x, y)
    elif event_type == "mousemove":
        x = _scale_coord(message.get("x"), message.get("viewportWidth", _VIEWPORT_WIDTH))
        y = _scale_coord(message.get("y"), message.get("viewportHeight", _VIEWPORT_HEIGHT))
        await page.mouse.move(x, y)
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


def _scale_coord(value: Any, viewport_size: Any) -> float:
    try:
        coord = float(value)
        viewport = float(viewport_size)
    except (TypeError, ValueError):
        return 0.0
    return coord * (_VIEWPORT_WIDTH / viewport) if viewport else coord
