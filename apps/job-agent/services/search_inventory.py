"""Companies available for keyword and semantic job search.

Serves a round-robin window over active boards (so every board is scraped
over consecutive searches instead of only the alphabetically-first ones)
plus a small number of inactive boards due for re-probe, within budget.
An optional pack (registry tag) constrains the window to curated boards.
"""

from __future__ import annotations

from config import settings
from services.board_registry import get_board_registry


def get_searchable_companies(
    max_companies: int, pack: str | None = None
) -> list[dict[str, object]]:
    registry = get_board_registry()
    wanted = (pack or "").strip().lower() or None
    due = registry.get_boards_due_for_reprobe(limit=settings.board_reprobe_slots)
    if wanted:
        due = [
            board
            for board in due
            if wanted in {str(tag).lower() for tag in board.get("tags", [])}
        ]
    active = registry.list_active_boards()
    if wanted:
        active = [
            board
            for board in active
            if wanted in {str(tag).lower() for tag in board.get("tags", [])}
        ]
    window = registry.rotation_window(active, max(0, max_companies - len(due)))
    return [*window, *due]
