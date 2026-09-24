"""Companies available for keyword and semantic job search.

Serves a round-robin window over active boards (so every board is scraped
over consecutive searches instead of only the alphabetically-first ones)
plus a small number of inactive boards due for re-probe, within budget.
"""

from __future__ import annotations

from config import settings
from services.board_registry import get_board_registry


def get_searchable_companies(max_companies: int) -> list[dict[str, object]]:
    registry = get_board_registry()
    due = registry.get_boards_due_for_reprobe(limit=settings.board_reprobe_slots)
    active = registry.list_active_boards()
    window = registry.rotation_window(active, max(0, max_companies - len(due)))
    return [*window, *due]
