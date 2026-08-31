"""Tests for visible vs presence-only CAPTCHA detection."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.browser.captcha import detect_visible_captcha_challenge


@pytest.mark.asyncio
async def test_invisible_recaptcha_is_not_a_visible_challenge() -> None:
    page = MagicMock()
    page.evaluate = AsyncMock(return_value=False)
    assert await detect_visible_captcha_challenge(page) is False
    page.evaluate.assert_awaited_once()


@pytest.mark.asyncio
async def test_visible_challenge_is_detected() -> None:
    page = MagicMock()
    page.evaluate = AsyncMock(return_value=True)
    assert await detect_visible_captcha_challenge(page) is True
