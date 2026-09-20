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
    payload = json.loads(REGISTRY_SEED_PATH.read_text(encoding="utf-8"))
    expected_active = sum(1 for row in payload if row.get("active", True))
    boards = registry.list_active_boards()
    assert len(boards) == expected_active
    assert len(registry.list_all_boards()) == len(payload)
    stripe = next(b for b in boards if b["domain"] == "stripe.com")
    assert stripe["ats_type"] == "greenhouse"
    assert stripe["ats_slug"] == "stripe"
    assert stripe["name"] == "Stripe"


def test_seed_active_entries_have_probeable_boards() -> None:
    from services.board_audit import probe_url_for
    from services.ingest import PARSERS

    payload = json.loads(REGISTRY_SEED_PATH.read_text(encoding="utf-8"))
    for row in payload:
        assert row["ats_type"] in PARSERS, row["domain"]
        assert row["ats_slug"], row["domain"]
        if row.get("active", True):
            assert probe_url_for(row["ats_type"], row["ats_slug"]) is not None


def _write_seed(seed_path: Path, rows: list[dict]) -> None:
    seed_path.write_text(json.dumps(rows), encoding="utf-8")


def _seed_row(domain: str, ats_type: str, ats_slug: str, active: bool = True) -> dict:
    return {
        "domain": domain,
        "company_name": domain,
        "ats_type": ats_type,
        "ats_slug": ats_slug,
        "career_url": None,
        "source": "pilot",
        "active": active,
    }


def test_sync_seed_corrects_stale_pilot_row(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services import board_registry as registry_module

    monkeypatch.setattr("services.board_registry.settings.board_max_failures", 1)
    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    _write_seed(seed_path, [_seed_row("old.com", "greenhouse", "old")])
    registry = BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path)
    registry.init_db()
    assert registry.record_board_failure("old.com") is True

    _write_seed(seed_path, [_seed_row("old.com", "ashby", "old")])
    monkeypatch.setattr(registry_module, "_registry", None)
    BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path).init_db()

    board = registry.get_board_by_domain("old.com")
    assert board is not None
    assert board["ats_type"] == "ashby"
    assert board["ats_slug"] == "old"
    assert board["active"] is True


def test_sync_seed_preserves_manual_rows(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services import board_registry as registry_module

    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    _write_seed(seed_path, [_seed_row("co.com", "greenhouse", "co")])
    registry = BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path)
    registry.init_db()
    registry.upsert_board(
        domain="co.com",
        company_name="Co",
        ats_type="lever",
        ats_slug="co",
        source="manual",
    )

    _write_seed(seed_path, [_seed_row("co.com", "ashby", "co")])
    BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path).init_db()

    board = registry.get_board_by_domain("co.com")
    assert board is not None
    assert board["ats_type"] == "lever"


def test_sync_seed_applies_explicit_deactivation_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services import board_registry as registry_module

    monkeypatch.setattr("services.board_registry.settings.board_max_failures", 1)
    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    _write_seed(
        seed_path,
        [_seed_row("off.com", "greenhouse", "off"), _seed_row("on.com", "greenhouse", "on")],
    )
    registry = BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path)
    registry.init_db()
    assert registry.record_board_failure("on.com") is True

    _write_seed(
        seed_path,
        [
            _seed_row("off.com", "greenhouse", "off", active=False),
            _seed_row("on.com", "greenhouse", "on", active=True),
        ],
    )
    BoardRegistry(db_path=tmp_path / "r.db", seed_path=seed_path).init_db()

    assert registry.get_board_by_domain("off.com")["active"] is False
    assert registry.get_board_by_domain("on.com")["active"] is False


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


def test_record_board_failure_deactivates_after_max(
    registry: BoardRegistry, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("services.board_registry.settings.board_max_failures", 2)
    registry.init_db()
    deactivated = registry.record_board_failure("stripe.com")
    assert deactivated is False
    deactivated = registry.record_board_failure("stripe.com")
    assert deactivated is True
    assert "stripe.com" not in {b["domain"] for b in registry.list_active_boards()}


def test_set_active_deactivates_board(registry: BoardRegistry) -> None:
    registry.init_db()
    registry.set_active("stripe.com", False)
    domains = {b["domain"] for b in registry.list_active_boards()}
    assert "stripe.com" not in domains
    all_boards = registry.list_all_boards()
    stripe = next(b for b in all_boards if b["domain"] == "stripe.com")
    assert stripe["active"] is False


def test_record_board_success_reactivates(
    registry: BoardRegistry, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("services.board_registry.settings.board_max_failures", 1)
    registry.init_db()
    assert registry.record_board_failure("stripe.com") is True
    registry.record_board_success("stripe.com")
    stripe = registry.get_board_by_domain("stripe.com")
    assert stripe is not None
    assert stripe["active"] is True


def test_seed_and_sync_round_trip_tags(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services import board_registry as registry_module

    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    seed_path.write_text(
        json.dumps(
            [
                {
                    "domain": "tagged.com",
                    "company_name": "Tagged",
                    "ats_type": "greenhouse",
                    "ats_slug": "tagged",
                    "career_url": None,
                    "source": "pilot",
                    "active": True,
                    "tags": ["fintech"],
                }
            ]
        ),
        encoding="utf-8",
    )
    registry = BoardRegistry(db_path=tmp_path / "tags.db", seed_path=seed_path)
    registry.init_db()
    board = registry.get_board_by_domain("tagged.com")
    assert board is not None
    assert board["tags"] == ["fintech"]

    seed_path.write_text(
        json.dumps(
            [
                {
                    "domain": "tagged.com",
                    "company_name": "Tagged",
                    "ats_type": "greenhouse",
                    "ats_slug": "tagged",
                    "career_url": None,
                    "source": "pilot",
                    "active": True,
                    "tags": ["fintech", "eu"],
                }
            ]
        ),
        encoding="utf-8",
    )
    BoardRegistry(db_path=tmp_path / "tags.db", seed_path=seed_path).init_db()
    board = registry.get_board_by_domain("tagged.com")
    assert board is not None
    assert board["tags"] == ["eu", "fintech"]


def test_rotation_window_advances_cursor(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from services import board_registry as registry_module

    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    seed_path.write_text("[]", encoding="utf-8")
    registry = BoardRegistry(db_path=tmp_path / "rot.db", seed_path=seed_path)
    for index in range(4):
        registry.upsert_board(
            domain=f"r{index}.com",
            company_name=f"R{index}",
            ats_type="greenhouse",
            ats_slug=f"r{index}",
            source="manual",
        )
    boards = registry.list_active_boards()
    first = registry.rotation_window(boards, 3)
    second = registry.rotation_window(boards, 3)
    assert {b["domain"] for b in first} == {"r0.com", "r1.com", "r2.com"}
    assert {b["domain"] for b in second} == {"r3.com", "r0.com", "r1.com"}
    assert registry.get_rotation_cursor() == 6


def test_reprobe_backoff_scales_with_failures(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sqlite3
    from datetime import datetime, timedelta, timezone

    from services import board_registry as registry_module

    monkeypatch.setattr(registry_module, "_registry", None)
    seed_path = tmp_path / "seed.json"
    seed_path.write_text("[]", encoding="utf-8")
    registry = BoardRegistry(db_path=tmp_path / "re.db", seed_path=seed_path)
    registry.upsert_board(
        domain="old.com",
        company_name="Old",
        ats_type="greenhouse",
        ats_slug="old",
        source="manual",
    )
    registry.set_active("old.com", False)
    stale = (datetime.now(timezone.utc) - timedelta(hours=100)).isoformat()
    with sqlite3.connect(tmp_path / "re.db") as conn:
        conn.execute(
            "UPDATE board_registry SET updated_at = ?, failure_count = 3"
            " WHERE domain = 'old.com'",
            (stale,),
        )
    due = registry.get_boards_due_for_reprobe(
        base_hours=24, max_hours=168, now=datetime.now(timezone.utc)
    )
    assert [b["domain"] for b in due] == ["old.com"]
    fresh_due = registry.get_boards_due_for_reprobe(
        base_hours=200, max_hours=400, now=datetime.now(timezone.utc)
    )
    assert fresh_due == []
