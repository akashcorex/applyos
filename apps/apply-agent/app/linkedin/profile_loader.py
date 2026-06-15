"""Load a LinkedIn profile page in stealth mode.

Opens a profile URL, waits for key elements to render,
and determines which actions (Connect / Follow) are available.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from playwright.async_api import Page

from app.browser.human_delay import human_scroll, random_pause

logger = logging.getLogger(__name__)


@dataclass
class ProfileActions:
    """What actions are available on this LinkedIn profile."""

    can_connect: bool = False
    can_follow: bool = False
    is_already_connected: bool = False
    name: str = ""
    headline: str = ""


async def load_profile(page: Page, profile_url: str) -> ProfileActions:
    """Navigate to *profile_url* and detect available actions.

    The page must already be in an authenticated LinkedIn session
    (cookies restored via session_manager).
    """
    await page.goto(str(profile_url), wait_until="domcontentloaded", timeout=30_000)
    await random_pause(2.0, 4.0)

    # Scroll down a little to trigger lazy-loaded elements
    await human_scroll(page, 300)
    await random_pause(1.0, 2.0)

    actions = ProfileActions()

    # Extract name
    name_el = await page.query_selector("h1.text-heading-xlarge, h1.inline")
    if name_el:
        actions.name = (await name_el.inner_text()).strip()

    # Extract headline
    headline_el = await page.query_selector("div.text-body-medium, div.pv-text-details__left-panel div")
    if headline_el:
        actions.headline = (await headline_el.inner_text()).strip()

    # Check for Connect button
    connect_btn = await page.query_selector(
        "button:has-text('Connect'), "
        "button[aria-label*='connect' i], "
        "div.pvs-profile-actions button:has-text('Connect')"
    )
    if connect_btn:
        actions.can_connect = True

    # Check if already connected
    msg_btn = await page.query_selector(
        "button:has-text('Message'), "
        "a:has-text('Message')"
    )
    if msg_btn and not connect_btn:
        actions.is_already_connected = True

    # Check for Follow button
    follow_btn = await page.query_selector(
        "button:has-text('Follow'), "
        "button[aria-label*='follow' i]"
    )
    if follow_btn:
        actions.can_follow = True

    logger.info(
        "Profile loaded: name=%s connect=%s follow=%s already_connected=%s",
        actions.name, actions.can_connect, actions.can_follow, actions.is_already_connected,
    )
    return actions
