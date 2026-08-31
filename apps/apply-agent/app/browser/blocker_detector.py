"""Detect blockers that require human intervention."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass

from playwright.async_api import Page

from app.browser.captcha import detect_turnstile, detect_visible_captcha_challenge
from app.browser.session_manager import is_linkedin_login_url, is_wellfound_login_url
from app.config import settings

logger = logging.getLogger(__name__)

_OTP_PATTERNS = re.compile(
    r"\b(otp|one[- ]time|verification code|2fa|two[- ]factor|mfa|authenticator)\b",
    re.IGNORECASE,
)

_LOGIN_BODY_PATTERNS = re.compile(
    r"\b(sign in|log in|create account|enter password|forgot password)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class BlockerResult:
    type: str
    message: str


async def detect_blocker(page: Page) -> BlockerResult | None:
    """Return a blocker if the page requires human intervention."""
    url = page.url

    if is_linkedin_login_url(url) or is_wellfound_login_url(url):
        return BlockerResult(
            type="LOGIN",
            message="Login page detected — sign in required before continuing",
        )

    if await detect_turnstile(page):
        return BlockerResult(
            type="CLOUDFLARE",
            message="Cloudflare verification is blocking this application",
        )

    # Invisible reCAPTCHA badges/iframes are common on ATS pages and must not
    # pause HITL before the form is filled.
    if await detect_visible_captcha_challenge(page):
        return BlockerResult(
            type="CAPTCHA",
            message="CAPTCHA verification requires human interaction",
        )

    try:
        body_text = await page.evaluate(
            "() => document.body?.innerText?.slice(0, 4000) || ''"
        )
    except Exception:
        body_text = ""

    if _OTP_PATTERNS.search(body_text):
        return BlockerResult(
            type="OTP",
            message="OTP or two-factor verification required",
        )

    if _LOGIN_BODY_PATTERNS.search(body_text) and await _has_password_field(page):
        return BlockerResult(
            type="AUTHENTICATION",
            message="Authentication form detected — credentials required",
        )

    return None


async def verify_blocker_cleared(page: Page, expected_type: str | None = None) -> bool:
    """Return True when no blocker remains on the current page."""
    blocker = await detect_blocker(page)
    if blocker is None:
        return True
    if expected_type and blocker.type != expected_type:
        # A different blocker appeared — still blocked.
        logger.info(
            "Blocker changed from %s to %s during verification",
            expected_type,
            blocker.type,
        )
        return False
    return False


async def _has_password_field(page: Page) -> bool:
    return await page.query_selector("input[type='password']") is not None


def captcha_solver_allowed() -> bool:
    """CapSolver must not run in HITL mode — human completes blockers instead."""
    return settings.captcha_solver_enabled and not settings.hitl_mode
