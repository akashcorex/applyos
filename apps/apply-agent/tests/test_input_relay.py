"""Tests for browser input relay."""

from app.streaming.input_relay import _scale_coord


def test_scale_coord_maps_viewport_to_browser() -> None:
    assert _scale_coord(720, 1440) == 720.0
    assert _scale_coord(360, 720) == 720.0
