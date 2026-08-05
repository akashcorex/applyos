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

    # Extract name — LinkedIn markup varies by locale and A/B tests
    name_selectors = (
        "h1.text-heading-xlarge",
        "h1.inline",
        "h1[data-anonymize='person-name']",
        ".pv-text-details-left-panel h1",
    )
    for selector in name_selectors:
        name_el = await page.query_selector(selector)
        if name_el:
            text = (await name_el.inner_text()).strip()
            if text:
                actions.name = text
                break

    # Extract headline
    headline_el = await page.query_selector(
        "div.text-body-medium.break-words, "
        "div.text-body-medium, "
        "div.pv-text-details__left-panel div.text-body-medium"
    )
    if headline_el:
        actions.headline = (await headline_el.inner_text()).strip()

    profile_actions = page.locator(
        ".pvs-profile-actions, .pv-top-card-v2-ctas"
    ).first

    # Connect in primary profile action bar (exclude Follow-only buttons)
    connect_btn = profile_actions.locator(
        "button:has-text('Connect'), "
        "button[aria-label*='Invite'][aria-label*='connect' i]"
    ).first
    try:
        actions.can_connect = await connect_btn.is_visible(timeout=2_000)
    except Exception:
        actions.can_connect = False

    # Already connected → Message visible, no Connect
    msg_btn = profile_actions.locator(
        "button:has-text('Message'), a:has-text('Message')"
    ).first
    try:
        has_message = await msg_btn.is_visible(timeout=1_500)
    except Exception:
        has_message = False
    if has_message and not actions.can_connect:
        actions.is_already_connected = True

    # Follow as fallback when Connect unavailable
    follow_btn = profile_actions.locator(
        "button:has-text('Follow'), button[aria-label*='follow' i]"
    ).first
    try:
        actions.can_follow = await follow_btn.is_visible(timeout=1_500)
    except Exception:
        actions.can_follow = False

    logger.info(
        "Profile loaded: name=%s connect=%s follow=%s already_connected=%s",
        actions.name, actions.can_connect, actions.can_follow, actions.is_already_connected,
    )
    return actions
