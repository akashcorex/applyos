"""Tests for browser session cookie validation."""

from app.browser.session_manager import (
    has_linkedin_cookies,
    has_wellfound_cookies,
    should_save_session,
)
from app.ats.wellfound import WellfoundHandler


def test_has_linkedin_cookies_true() -> None:
    state = {
        "cookies": [
            {"name": "li_at", "domain": ".linkedin.com", "value": "abc"},
        ],
    }
    assert has_linkedin_cookies(state) is True


def test_has_linkedin_cookies_false_without_li_at() -> None:
    state = {
        "cookies": [
            {"name": "session", "domain": ".ashbyhq.com", "value": "xyz"},
        ],
    }
    assert has_linkedin_cookies(state) is False


def test_has_linkedin_cookies_false_when_none() -> None:
    assert has_linkedin_cookies(None) is False


def test_should_save_session_when_linkedin_at_start() -> None:
    state = {"cookies": []}
    assert should_save_session(state, had_linkedin_at_start=True) is True


def test_should_not_save_ashby_only_session() -> None:
    state = {
        "cookies": [
            {"name": "session", "domain": ".ashbyhq.com", "value": "xyz"},
        ],
    }
    assert should_save_session(state, had_linkedin_at_start=False) is False


def test_should_save_when_linkedin_cookies_acquired() -> None:
    state = {
        "cookies": [
            {"name": "li_at", "domain": ".linkedin.com", "value": "abc"},
        ],
    }
    assert should_save_session(state, had_linkedin_at_start=False) is True


def test_has_wellfound_cookies() -> None:
    state = {
        "cookies": [
            {"name": "_wellfound", "domain": ".wellfound.com", "value": "abc"},
        ],
    }
    assert has_wellfound_cookies(state) is True


def test_should_save_wellfound_session() -> None:
    state = {"cookies": []}
    assert (
        should_save_session(
            state, had_linkedin_at_start=False, had_wellfound_at_start=True
        )
        is True
    )


def test_wellfound_job_id_from_url() -> None:
    handler = WellfoundHandler()
    assert handler.job_listing_id_from_url(
        "https://wellfound.com/jobs/123456-engineer-at-acme"
    ) == "123456"
    assert handler.job_listing_id_from_url("https://greenhouse.io/jobs/1") is None
