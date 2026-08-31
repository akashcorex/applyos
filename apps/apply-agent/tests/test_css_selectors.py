"""Tests for CSS selector helpers."""

from app.ats.base import css_id_selector, normalize_selector


def test_css_id_selector_uses_attribute_form_for_numeric_ids() -> None:
    assert css_id_selector("430") == '[id="430"]'
    assert css_id_selector("first_name") == "#first_name"


def test_normalize_selector_fixes_hash_numeric_ids() -> None:
    assert normalize_selector("#430") == '[id="430"]'
    assert normalize_selector("input[name='email']") == "input[name='email']"
