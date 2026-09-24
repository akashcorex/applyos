#!/usr/bin/env python3
"""Audit every registry board's ATS endpoint (read-only, live network).

Reads boards from the registry DB (no status writes) and probes each public
ATS URL directly via ingest.scrape_jobs, bypassing the board cache and the
failure counters. Prints a human-readable table and optionally a JSON dump.

Usage:
    uv run python scripts/audit_boards.py [--limit 37] [--json-out audit.json]
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.board_audit import audit_boards, summarize_attempts
from services.board_registry import get_board_registry


def _row(attempt) -> str:
    titles = f" e.g. {attempt.sample_titles[0]}" if attempt.sample_titles else ""
    err = f" ({attempt.error})" if attempt.error else ""
    return (
        f"{attempt.status:7} {attempt.jobs_found:5} "
        f"{attempt.domain:22} {attempt.ats_type}/{attempt.ats_slug}"
        f"{titles}{err}"
    )


async def main_async(limit: int, concurrency: int) -> list:
    boards = get_board_registry().list_all_boards()
    companies = [
        {
            "name": str(board["name"]),
            "domain": str(board["domain"]),
            "ats_type": str(board["ats_type"]),
            "ats_slug": str(board["ats_slug"]),
        }
        for board in boards[:limit]
    ]
    return await audit_boards(companies, concurrency=concurrency)


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit registry ATS boards")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--concurrency", type=int, default=8)
    parser.add_argument("--json-out", type=str, default=None)
    args = parser.parse_args()

    attempts = asyncio.run(main_async(args.limit, args.concurrency))
    summary = summarize_attempts(attempts)
    for attempt in attempts:
        print(_row(attempt))
    print(f"\n{json.dumps(summary, indent=2)}")
    if args.json_out:
        Path(args.json_out).write_text(
            json.dumps(
                {
                    "summary": summary,
                    "boards": [attempt.model_dump() for attempt in attempts],
                },
                indent=2,
            ),
            encoding="utf-8",
        )
    failing = summary["by_status"].get("empty", 0) + summary["by_status"].get(
        "error", 0
    )
    return 1 if failing else 0


if __name__ == "__main__":
    raise SystemExit(main())
