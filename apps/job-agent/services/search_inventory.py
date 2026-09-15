"""Companies available for keyword and semantic job search."""

from __future__ import annotations

from services.board_registry import get_board_registry


def get_searchable_companies(max_companies: int) -> list[dict[str, object]]:
    return get_board_registry().list_active_boards(limit=max_companies)
