"""Send a LinkedIn connection request with a personalised note."""

from __future__ import annotations

import logging
import re

from playwright.async_api import Page, TimeoutError as PlaywrightTimeoutError

from app.browser.human_delay import human_type, random_pause

logger = logging.getLogger(__name__)

_MAX_NOTE_LENGTH = 300  # LinkedIn's connection note limit
_DIALOG_SELECTOR = "[role='dialog'], .artdeco-modal, .send-invite"
_CONNECT_SENT_PATTERN = re.compile(
    r"pending|invitation sent|request sent",
    re.I,
)


async def _click_first_visible(page: Page, selectors: str) -> bool:
    for selector in selectors.split(", "):
        selector = selector.strip()
        if not selector:
            continue
        locator = page.locator(selector).first
        try:
            if await locator.is_visible(timeout=1_500):
                await locator.click()
                return True
        except PlaywrightTimeoutError:
            continue
    return False


async def _open_connect_flow(page: Page) -> bool:
    """Click Connect on the profile, including overflow / dropdown menus."""
    profile_actions = page.locator(
        ".pvs-profile-actions, .pv-top-card-v2-ctas, section.artdeco-card"
    ).first

    connect_selectors = (
        "button:has-text('Connect'), "
        "button[aria-label*='Invite'][aria-label*='connect' i], "
        "button[aria-label*='connect' i]:not([aria-label*='connected' i])"
    )

    scoped = profile_actions.locator(connect_selectors).first
    try:
        if await scoped.is_visible(timeout=2_000):
            await scoped.click()
            await random_pause(0.8, 1.5)
        else:
            clicked = await _click_first_visible(page, connect_selectors)
            if not clicked:
                logger.warning("Connect button not found on page")
                return False
            await random_pause(0.8, 1.5)
    except PlaywrightTimeoutError:
        clicked = await _click_first_visible(page, connect_selectors)
        if not clicked:
            logger.warning("Connect button not found on page")
            return False
        await random_pause(0.8, 1.5)

    # Overflow menu: Connect may live under "More"
    menu_connect = page.locator(
        "[role='menu'] button:has-text('Connect'), "
        "[role='menuitem']:has-text('Connect'), "
        ".artdeco-dropdown__content button:has-text('Connect')"
    ).first
    try:
        if await menu_connect.is_visible(timeout=1_500):
            await menu_connect.click()
            await random_pause(0.8, 1.5)
    except PlaywrightTimeoutError:
        pass

    # "How do you know this person?" → Other → Connect
    other_btn = page.locator("button:has-text('Other')").first
    try:
        if await other_btn.is_visible(timeout=1_500):
            await other_btn.click()
            await random_pause(0.5, 1.0)
            await _click_first_visible(page, "button:has-text('Connect')")
            await random_pause(0.5, 1.0)
    except PlaywrightTimeoutError:
        pass

    return True


async def _wait_for_invite_dialog(page: Page) -> bool:
    try:
        await page.locator(_DIALOG_SELECTOR).first.wait_for(
            state="visible",
            timeout=6_000,
        )
        return True
    except PlaywrightTimeoutError:
        return False


async def _click_send_invitation(page: Page, *, note: str | None) -> bool:
    """Click the send / send-without-note button inside the invite dialog."""
    dialog = page.locator(_DIALOG_SELECTOR).first

    if note:
        add_note = dialog.get_by_role("button", name=re.compile(r"add a note", re.I))
        try:
            if await add_note.is_visible(timeout=2_000):
                await add_note.click()
                await random_pause(0.5, 1.0)
                textarea = dialog.locator(
                    "textarea[name='message'], textarea#custom-message"
                ).first
                if await textarea.is_visible(timeout=2_000):
                    await human_type(
                        page,
                        "textarea[name='message'], textarea#custom-message",
                        note[:_MAX_NOTE_LENGTH],
                    )
        except PlaywrightTimeoutError:
            pass

    send_candidates = [
        dialog.get_by_role("button", name=re.compile(r"send without a note", re.I)),
        dialog.get_by_role("button", name=re.compile(r"send invitation", re.I)),
        dialog.get_by_role("button", name=re.compile(r"^send$", re.I)),
        dialog.locator("button[aria-label*='Send without a note' i]"),
        dialog.locator("button[aria-label*='Send invitation' i]"),
        dialog.locator("button[aria-label='Send now']"),
        dialog.locator("button.artdeco-button--primary"),
    ]

    for candidate in send_candidates:
        try:
            if await candidate.first.is_visible(timeout=1_500):
                await candidate.first.click()
                await random_pause(1.0, 2.0)
                return True
        except PlaywrightTimeoutError:
            continue

    # Fallback: page-level selectors (dialog markup varies)
    fallback = (
        "button:has-text('Send without a note'), "
        "button[aria-label*='Send without a note' i], "
        "button:has-text('Send invitation'), "
        "button[aria-label*='Send invitation' i], "
        "button[aria-label='Send now']"
    )
    return await _click_first_visible(page, fallback)


async def _connect_already_sent(page: Page) -> bool:
    """Detect immediate send or post-send Pending state."""
    body = await page.locator("body").inner_text()
    if _CONNECT_SENT_PATTERN.search(body):
        return True

    pending = page.locator(
        "button:has-text('Pending'), "
        "span:has-text('Pending'), "
        "button[aria-label*='Pending' i]"
    ).first
    try:
        return await pending.is_visible(timeout=1_500)
    except PlaywrightTimeoutError:
        return False


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
        if not await _open_connect_flow(page):
            return False

        has_dialog = await _wait_for_invite_dialog(page)
        if has_dialog:
            if not await _click_send_invitation(page, note=note):
                logger.warning("Send button not found after Connect dialog")
                return False
        elif not await _connect_already_sent(page):
            # Some profiles send on first Connect click with no modal.
            logger.warning("Connect clicked but no invite dialog or pending state")
            return False

        if await _connect_already_sent(page):
            logger.info("Connection request sent (note=%s)", bool(note))
            return True

        # Modal closed — Connect gone and Message visible is another success signal.
        connect_still_visible = page.locator(
            ".pvs-profile-actions button:has-text('Connect')"
        ).first
        try:
            still_connect = await connect_still_visible.is_visible(timeout=2_000)
        except PlaywrightTimeoutError:
            still_connect = False

        if not still_connect:
            logger.info("Connection request sent — Connect button no longer visible")
            return True

        logger.warning("Connect flow finished but success could not be verified")
        return False

    except Exception as exc:
        logger.error("Failed to send connection request: %s", exc)
        return False
