"""Human-like interaction delays to avoid bot detection.

Randomised typing speed, mouse-movement pauses, and scroll
behaviour make the automation harder to distinguish from a
real user session.
"""

from __future__ import annotations

import asyncio
import random

from playwright.async_api import Page

from app.browser.dom import first_visible


async def human_type(page: Page, selector: str, text: str) -> None:
    """Type *text* into the element matched by *selector* with random delays.

    Each keystroke is separated by 50–150 ms to mimic natural typing
    speed.  A small pause precedes and follows the typing burst.
    """
    await asyncio.sleep(random.uniform(0.3, 0.8))
    element = await first_visible(page, selector)
    if element:
        await element.click()
        await page.keyboard.press("Meta+A")
        await page.keyboard.press("Backspace")
        for char in text:
            await page.keyboard.type(char, delay=random.randint(50, 150))
        # Typing can race with resume autofill; trust the field, not the keystrokes.
        try:
            actual = (await element.input_value()).strip()
            if actual != text.strip():
                await element.fill(text)
        except Exception:
            pass
    await asyncio.sleep(random.uniform(0.2, 0.5))


async def human_click(page: Page, selector: str) -> None:
    """Click an element with a short random delay before and after."""
    await asyncio.sleep(random.uniform(0.2, 0.6))
    element = await first_visible(page, selector)
    if element:
        await element.click()
    await asyncio.sleep(random.uniform(0.3, 0.7))


async def human_scroll(page: Page, distance: int = 300) -> None:
    """Scroll down by *distance* pixels with a natural pause."""
    await asyncio.sleep(random.uniform(0.3, 0.6))
    await page.mouse.wheel(0, distance)
    await asyncio.sleep(random.uniform(0.5, 1.0))


async def random_pause(min_seconds: float = 1.0, max_seconds: float = 3.0) -> None:
    """Sleep for a random duration between *min_seconds* and *max_seconds*."""
    await asyncio.sleep(random.uniform(min_seconds, max_seconds))
