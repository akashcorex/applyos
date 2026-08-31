"""Tests for HITL application runner helpers."""

from app.workers.application_runner import _error_indicates_human_block


def test_captcha_error_detected() -> None:
    result = _error_indicates_human_block("Cloudflare verification required")
    assert result is not None
    assert result[0] == "CLOUDFLARE"


def test_login_error_detected() -> None:
    result = _error_indicates_human_block("LOGIN REQUIRED for Wellfound")
    assert result is not None
    assert result[0] == "LOGIN"


def test_normal_error_not_blocker() -> None:
    assert _error_indicates_human_block("Field validation failed") is None
