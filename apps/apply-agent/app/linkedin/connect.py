"""Send a LinkedIn connection request with a personalised note."""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.browser.human_delay import human_click, human_type, random_pause

logger = logging.getLogger(__name__)

_MAX_NOTE_LENGTH = 300  # LinkedIn's connection note limit


async def send_connection_request(
    page: Page,
    note: str | None = None,
) -> bool:
    """Click Connect on the current profile page and send a note.

    Assumes the profile has already been loaded via ``profile_loader``.

    Args:
        page: Playwright page on the target profile.
        note: Optional personalised message (max 300 chars).

    Returns:
        True if the request was sent successfully.
    """
    try:
        # Click the Connect button
        connect_btn = await page.query_selector(
            "button:has-text('Connect'), "
            "button[aria-label*='connect' i], "
            "div.pvs-profile-actions button:has-text('Connect')"
        )
        if not connect_btn:
            logger.warning("Connect button not found on page")
            return False

        await human_click(
            page,
            "button:has-text('Connect'), "
            "button[aria-label*='connect' i], "
            "div.pvs-profile-actions button:has-text('Connect')"
        )
        await random_pause(1.0, 2.0)

        # LinkedIn may ask "How do you know this person?"
        # Try to click "Other" if prompted
        other_btn = await page.query_selector("button:has-text('Other')")
        if other_btn:
            await human_click(page, "button:has-text('Other')")
            await random_pause(0.5, 1.0)
            # Then click Connect again
            connect_again = await page.query_selector("button:has-text('Connect')")
            if connect_again:
                await human_click(page, "button:has-text('Connect')")
                await random_pause(0.5, 1.0)

        # If we want to add a note
        if note:
            add_note_btn = await page.query_selector(
                "button:has-text('Add a note'), "
                "button[aria-label='Add a note']"
            )
            if add_note_btn:
                await human_click(
                    page,
                    "button:has-text('Add a note'), "
                    "button[aria-label='Add a note']"
                )
                await random_pause(0.5, 1.0)

                # Type the note
                truncated_note = note[:_MAX_NOTE_LENGTH]
                textarea = await page.query_selector(
                    "textarea[name='message'], textarea#custom-message"
                )
                if textarea:
                    await human_type(
                        page,
                        "textarea[name='message'], textarea#custom-message",
                        truncated_note,
                    )

        # Send the request
        send_btn = await page.query_selector(
            "button:has-text('Send'), "
            "button[aria-label='Send now'], "
            "button[aria-label='Send invitation']"
        )
        if send_btn:
            await human_click(
                page,
                "button:has-text('Send'), "
                "button[aria-label='Send now'], "
                "button[aria-label='Send invitation']"
            )
            await random_pause(1.0, 2.0)
            logger.info("Connection request sent")
            return True

        logger.warning("Send button not found after adding note")
        return False

    except Exception as e:
        logger.error("Failed to send connection request: %s", e)
        return False
