"""Tests for blocker detection."""

import pytest

from app.browser.blocker_detector import captcha_solver_allowed


def test_captcha_solver_disabled_in_hitl_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.browser.blocker_detector.settings.hitl_mode", True)
    monkeypatch.setattr("app.browser.blocker_detector.settings.captcha_solver_enabled", True)
    assert captcha_solver_allowed() is False


def test_captcha_solver_respects_setting_when_hitl_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("app.browser.blocker_detector.settings.hitl_mode", False)
    monkeypatch.setattr("app.browser.blocker_detector.settings.captcha_solver_enabled", True)
    assert captcha_solver_allowed() is True
