"""SQLite-backed company board registry seeded from data/board_registry.json."""

from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from config import settings

logger = logging.getLogger(__name__)

BoardSource = Literal["pilot", "yc", "detect", "manual"]

REGISTRY_SEED_PATH = Path(__file__).resolve().parent.parent / "data" / "board_registry.json"
DEFAULT_DB_PATH = Path(__file__).resolve().parent.parent / "data" / "board_registry.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS board_registry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL UNIQUE,
    company_name TEXT NOT NULL,
    ats_type TEXT NOT NULL,
    ats_slug TEXT NOT NULL,
    career_url TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    active INTEGER NOT NULL DEFAULT 1,
    last_verified_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_board_registry_active
    ON board_registry(active);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _row_to_company(row: sqlite3.Row) -> dict[str, object]:
    return {
        "name": row["company_name"],
        "domain": row["domain"],
        "ats_type": row["ats_type"],
        "ats_slug": row["ats_slug"],
        "career_url": row["career_url"],
        "source": row["source"],
        "active": bool(row["active"]),
        "last_verified_at": row["last_verified_at"],
    }


class BoardRegistry:
    def __init__(self, db_path: Path | None = None, seed_path: Path | None = None) -> None:
        self.db_path = db_path or Path(settings.registry_db_path)
        self.seed_path = seed_path or REGISTRY_SEED_PATH

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_db(self) -> None:
        with self._connect() as conn:
            conn.executescript(_SCHEMA)
            self._ensure_columns(conn)
            count = conn.execute("SELECT COUNT(*) FROM board_registry").fetchone()[0]
            if count == 0:
                self._seed_from_json(conn)
            else:
                self._sync_seed(conn)

    def _sync_seed(self, conn: sqlite3.Connection) -> None:
        """Apply seed corrections to seed-sourced rows only.

        Seed entries (source pilot/yc) are the source of truth for ATS
        mapping; manual/detect rows are never touched. A changed ATS mapping
        resets failure counters and reactivates the board for re-verification.
        """
        if not self.seed_path.exists():
            return
        payload = json.loads(self.seed_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            return
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            domain = str(entry.get("domain", "")).strip().lower()
            if not domain or str(entry.get("source", "manual")) not in (
                "pilot",
                "yc",
            ):
                continue
            row = conn.execute(
                "SELECT ats_type, ats_slug, career_url, source, active"
                " FROM board_registry WHERE domain = ?",
                (domain,),
            ).fetchone()
            if row is None or row["source"] not in ("pilot", "yc"):
                continue
            ats_type = str(entry["ats_type"])
            ats_slug = str(entry["ats_slug"])
            seed_active = bool(entry.get("active", True))
            seed_career_url = entry.get("career_url")
            mapping_changed = (
                row["ats_type"] != ats_type or row["ats_slug"] != ats_slug
            )
            needs_career_url = bool(seed_career_url) and row["career_url"] is None
            needs_deactivation = bool(row["active"]) and not seed_active
            if not mapping_changed and not needs_career_url and not needs_deactivation:
                continue
            if mapping_changed:
                conn.execute(
                    """
                    UPDATE board_registry
                    SET ats_type = ?, ats_slug = ?,
                        career_url = COALESCE(?, career_url),
                        company_name = ?, source = ?,
                        active = ?, failure_count = 0,
                        last_verified_at = NULL, updated_at = ?
                    WHERE domain = ?
                    """,
                    (
                        ats_type,
                        ats_slug,
                        seed_career_url,
                        str(entry.get("company_name", domain)),
                        str(entry.get("source", "pilot")),
                        1 if seed_active else 0,
                        _utc_now(),
                        domain,
                    ),
                )
                logger.info(
                    "Seed correction applied for %s: %s/%s -> %s/%s",
                    domain,
                    row["ats_type"],
                    row["ats_slug"],
                    ats_type,
                    ats_slug,
                )
                continue
            conn.execute(
                """
                UPDATE board_registry
                SET career_url = COALESCE(?, career_url),
                    active = CASE WHEN ? THEN active ELSE 0 END,
                    updated_at = ?
                WHERE domain = ?
                """,
                (
                    seed_career_url,
                    1 if seed_active else 0,
                    _utc_now(),
                    domain,
                ),
            )
            if row["active"] and not seed_active:
                logger.info("Seed active=False applied for %s", domain)

    def _ensure_columns(self, conn: sqlite3.Connection) -> None:
        columns = {
            row[1] for row in conn.execute("PRAGMA table_info(board_registry)")
        }
        if "failure_count" not in columns:
            conn.execute(
                "ALTER TABLE board_registry ADD COLUMN failure_count INTEGER NOT NULL DEFAULT 0"
            )

    def _seed_from_json(self, conn: sqlite3.Connection) -> None:
        if not self.seed_path.exists():
            return
        payload = json.loads(self.seed_path.read_text(encoding="utf-8"))
        if not isinstance(payload, list):
            raise RuntimeError("board_registry seed must be a JSON array")
        now = _utc_now()
        for entry in payload:
            if not isinstance(entry, dict):
                continue
            domain = str(entry.get("domain", "")).strip().lower()
            if not domain:
                continue
            conn.execute(
                """
                INSERT OR IGNORE INTO board_registry (
                    domain, company_name, ats_type, ats_slug, career_url,
                    source, active, last_verified_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    domain,
                    str(entry.get("company_name", domain)),
                    str(entry["ats_type"]),
                    str(entry["ats_slug"]),
                    entry.get("career_url"),
                    str(entry.get("source", "manual")),
                    1 if entry.get("active", True) else 0,
                    entry.get("last_verified_at"),
                    now,
                    now,
                ),
            )

    def list_active_boards(self, limit: int | None = None) -> list[dict[str, object]]:
        self.init_db()
        query = """
            SELECT * FROM board_registry
            WHERE active = 1 AND ats_type != '' AND ats_slug != ''
            ORDER BY company_name COLLATE NOCASE
        """
        params: tuple[object, ...] = ()
        if limit is not None:
            query += " LIMIT ?"
            params = (limit,)
        with self._connect() as conn:
            rows = conn.execute(query, params).fetchall()
        return [_row_to_company(row) for row in rows]

    def list_all_boards(self) -> list[dict[str, object]]:
        self.init_db()
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM board_registry ORDER BY company_name COLLATE NOCASE"
            ).fetchall()
        return [_row_to_company(row) for row in rows]

    def get_board_by_domain(self, domain: str) -> dict[str, object] | None:
        self.init_db()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM board_registry WHERE domain = ?",
                (domain.strip().lower(),),
            ).fetchone()
        return _row_to_company(row) if row else None

    def upsert_board(
        self,
        *,
        domain: str,
        company_name: str,
        ats_type: str,
        ats_slug: str,
        career_url: str | None = None,
        source: BoardSource = "manual",
        active: bool = True,
    ) -> dict[str, object]:
        self.init_db()
        domain = domain.strip().lower()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO board_registry (
                    domain, company_name, ats_type, ats_slug, career_url,
                    source, active, last_verified_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(domain) DO UPDATE SET
                    company_name = excluded.company_name,
                    ats_type = excluded.ats_type,
                    ats_slug = excluded.ats_slug,
                    career_url = COALESCE(excluded.career_url, board_registry.career_url),
                    source = excluded.source,
                    active = excluded.active,
                    last_verified_at = excluded.last_verified_at,
                    updated_at = excluded.updated_at
                """,
                (
                    domain,
                    company_name,
                    ats_type,
                    ats_slug,
                    career_url,
                    source,
                    1 if active else 0,
                    now,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM board_registry WHERE domain = ?", (domain,)
            ).fetchone()
        if row is None:
            raise RuntimeError(f"Failed to upsert board for {domain}")
        return _row_to_company(row)

    def set_active(self, domain: str, active: bool) -> None:
        self.init_db()
        with self._connect() as conn:
            conn.execute(
                "UPDATE board_registry SET active = ?, updated_at = ? WHERE domain = ?",
                (1 if active else 0, _utc_now(), domain.strip().lower()),
            )

    def record_board_success(self, domain: str) -> None:
        self.init_db()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE board_registry
                SET failure_count = 0,
                    last_verified_at = ?,
                    updated_at = ?
                WHERE domain = ?
                """,
                (now, now, domain.strip().lower()),
            )

    def record_board_failure(self, domain: str) -> bool:
        self.init_db()
        domain = domain.strip().lower()
        now = _utc_now()
        with self._connect() as conn:
            conn.execute(
                """
                UPDATE board_registry
                SET failure_count = failure_count + 1,
                    updated_at = ?
                WHERE domain = ?
                """,
                (now, domain),
            )
            row = conn.execute(
                "SELECT failure_count FROM board_registry WHERE domain = ?",
                (domain,),
            ).fetchone()
            if row is None:
                return False
            failure_count = int(row["failure_count"])
            if failure_count >= settings.board_max_failures:
                conn.execute(
                    "UPDATE board_registry SET active = 0, updated_at = ? WHERE domain = ?",
                    (now, domain),
                )
                return True
        return False


_registry: BoardRegistry | None = None


def get_board_registry() -> BoardRegistry:
    global _registry
    if _registry is None:
        _registry = BoardRegistry()
    return _registry
