"""Track first-seen timestamps for job listings."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import settings

_SCHEMA = """
CREATE TABLE IF NOT EXISTS job_snapshots (
    dedup_key TEXT PRIMARY KEY,
    posted_at TEXT,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
);
"""


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _connect() -> sqlite3.Connection:
    db_path = Path(settings.registry_db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_job_snapshots() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def record_job_seen(dedup_key: str, posted_at: str | None) -> str:
    init_job_snapshots()
    now = _utc_now()
    with _connect() as conn:
        row = conn.execute(
            "SELECT first_seen_at FROM job_snapshots WHERE dedup_key = ?",
            (dedup_key,),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO job_snapshots (dedup_key, posted_at, first_seen_at, last_seen_at)
                VALUES (?, ?, ?, ?)
                """,
                (dedup_key, posted_at, now, now),
            )
            return now
        conn.execute(
            """
            UPDATE job_snapshots
            SET posted_at = COALESCE(?, posted_at),
                last_seen_at = ?
            WHERE dedup_key = ?
            """,
            (posted_at, now, dedup_key),
        )
        return str(row["first_seen_at"])


def get_first_seen_at(dedup_key: str) -> str | None:
    init_job_snapshots()
    with _connect() as conn:
        row = conn.execute(
            "SELECT first_seen_at FROM job_snapshots WHERE dedup_key = ?",
            (dedup_key,),
        ).fetchone()
    return str(row["first_seen_at"]) if row else None
