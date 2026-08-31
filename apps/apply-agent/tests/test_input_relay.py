"""Tests for browser input relay."""

from app.streaming.input_relay import map_click_to_page


def test_map_click_scales_display_coords_to_page() -> None:
    page_x, page_y = map_click_to_page(
        360,
        225,
        display_width=720,
        display_height=450,
    )
    assert page_x == 720.0
    assert page_y == 450.0


def test_map_click_passes_through_page_pixel_coords() -> None:
    page_x, page_y = map_click_to_page(
        812,
        540,
        display_width=1440,
        display_height=900,
    )
    assert page_x == 812.0
    assert page_y == 540.0
