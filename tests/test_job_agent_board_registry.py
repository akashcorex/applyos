import json
from pathlib import Path

import pytest

from services.board_registry import BoardRegistry, REGISTRY_SEED_PATH


@pytest.fixture
def registry(tmp_path: Path) -> BoardRegistry:
    return BoardRegistry(
        db_path=tmp_path / "registry.db",
        seed_path=REGISTRY_SEED_PATH,
    )


def test_seed_file_has_pilot_boards() -> None:
    payload = json.loads(REGISTRY_SEED_PATH.read_text(encoding="utf-8"))
    domains = {row["domain"] for row in payload}
    types = {row["ats_type"] for row in payload}
    assert "stripe.com" in domains
    assert "anthropic.com" in domains
    assert len(payload) >= 37
    assert "ashby" in types
    assert "personio" in types
    assert "lever" in types


def test_init_db_seeds_from_json(registry: BoardRegistry) -> None:
    registry.init_db()
    boards = registry.list_active_boards()
    assert len(boards) >= 37
    stripe = next(b for b in boards if b["domain"] == "stripe.com")
    assert stripe["ats_type"] == "greenhouse"
    assert stripe["ats_slug"] == "stripe"
    assert stripe["name"] == "Stripe"


def test_upsert_board_updates_existing(registry: BoardRegistry) -> None:
    registry.init_db()
    updated = registry.upsert_board(
        domain="stripe.com",
        company_name="Stripe Inc",
        ats_type="greenhouse",
        ats_slug="stripe",
        source="manual",
    )
    assert updated["name"] == "Stripe Inc"
    boards = registry.list_active_boards()
    stripe = next(b for b in boards if b["domain"] == "stripe.com")
    assert stripe["name"] == "Stripe Inc"


def test_set_active_deactivates_board(registry: BoardRegistry) -> None:
    registry.init_db()
    registry.set_active("stripe.com", False)
    domains = {b["domain"] for b in registry.list_active_boards()}
    assert "stripe.com" not in domains
    all_boards = registry.list_all_boards()
    stripe = next(b for b in all_boards if b["domain"] == "stripe.com")
    assert stripe["active"] is False
