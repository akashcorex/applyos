"""Cached job listings per company board."""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config import settings
from models import SearchResult

_SCHEMA = """
CREATE TABLE IF NOT EXISTS board_job_cache (
    domain TEXT PRIMARY KEY,
    jobs_json TEXT NOT NULL,
    scraped_at TEXT NOT NULL
);
"""


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _connect() -> sqlite3.Connection:
    db_path = Path(settings.registry_db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(db_path)


def init_board_cache() -> None:
    with _connect() as conn:
        conn.executescript(_SCHEMA)


def get_cached_jobs(domain: str) -> list[SearchResult] | None:
    init_board_cache()
    with _connect() as conn:
        row = conn.execute(
            "SELECT jobs_json, scraped_at FROM board_job_cache WHERE domain = ?",
            (domain.strip().lower(),),
        ).fetchone()
    if row is None:
        return None
    scraped_at = datetime.fromisoformat(str(row[1]))
    age_seconds = (_utc_now() - scraped_at).total_seconds()
    if age_seconds > settings.board_cache_ttl_seconds:
        return None
    payload = json.loads(str(row[0]))
    return [SearchResult.model_validate(item) for item in payload]


def set_cached_jobs(domain: str, jobs: list[SearchResult]) -> None:
    init_board_cache()
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO board_job_cache (domain, jobs_json, scraped_at)
            VALUES (?, ?, ?)
            ON CONFLICT(domain) DO UPDATE SET
                jobs_json = excluded.jobs_json,
                scraped_at = excluded.scraped_at
            """,
            (
                domain.strip().lower(),
                json.dumps([job.model_dump() for job in jobs]),
                _utc_now().isoformat(),
            ),
        )


def get_cached_job_keys(domain: str) -> tuple[list[str], str] | None:
    """Cache-only listing keys for reconciliation (never triggers a scrape)."""
    init_board_cache()
    with _connect() as conn:
        row = conn.execute(
            "SELECT jobs_json, scraped_at FROM board_job_cache WHERE domain = ?",
            (domain.strip().lower(),),
        ).fetchone()
    if row is None:
        return None
    payload = json.loads(str(row[0]))
    keys = [
        str(item["dedup_key"])
        for item in payload
        if isinstance(item, dict) and item.get("dedup_key")
    ]
    return keys, str(row[1])
