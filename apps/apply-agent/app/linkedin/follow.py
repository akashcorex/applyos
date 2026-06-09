"""Follow a LinkedIn company page or user profile."""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.browser.human_delay import human_click, random_pause

logger = logging.getLogger(__name__)


async def follow_profile(page: Page) -> bool:
    """Click Follow on the current LinkedIn page.

    Works for both user profiles and company pages.
    Assumes the page has already been navigated to.

    Returns True if Follow was clicked successfully.
    """
    try:
        follow_btn = await page.query_selector(
            "button:has-text('Follow'), "
            "button[aria-label*='follow' i]"
        )
        if not follow_btn:
            logger.info("Follow button not found — user may already be followed")
            return False

        await human_click(
            page,
            "button:has-text('Follow'), "
            "button[aria-label*='follow' i]"
        )
        await random_pause(1.0, 2.0)

        # Verify the button changed to "Following"
        following_el = await page.query_selector(
            "button:has-text('Following'), "
            "button[aria-label*='following' i]"
        )
        if following_el:
            logger.info("Successfully followed the profile/company")
            return True

        logger.info("Follow clicked but could not verify state change")
        return True  # optimistic — click went through

    except Exception as e:
        logger.error("Failed to follow: %s", e)
        return False
