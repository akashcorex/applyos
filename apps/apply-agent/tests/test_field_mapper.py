"""Tests for literal-answer validation against real field options."""

from __future__ import annotations

from app.llm.field_mapper import _matches_options


def test_exact_option_matches() -> None:
    assert _matches_options("literal:No", ["Yes", "No"]) is True


def test_value_outside_options_is_rejected() -> None:
    assert _matches_options("literal:Prefer not to disclose", ["Woman", "Man"]) is False


def test_partial_option_matches() -> None:
    assert _matches_options("literal:Decline", ["Decline To Self Identify"]) is True


def test_case_insensitive() -> None:
    assert _matches_options("literal:yes - intern", ["Yes - Intern"]) is True


def test_empty_literal_is_rejected() -> None:
    assert _matches_options("literal:", ["Yes", "No"]) is False
