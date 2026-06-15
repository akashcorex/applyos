#!/usr/bin/env python3
"""Run job-agent tests from a single entrypoint."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
TEST_SUITES: dict[str, list[str]] = {
    "all": ["tests"],
    "dedup": ["tests/test_dedup.py"],
    "detect": ["tests/test_detect.py"],
    "ingest-route": ["tests/test_ingest_route.py"],
    "normalizer": ["tests/test_normalizer.py"],
    "parsers": ["tests/test_parsers.py"],
    "yc-parser": ["tests/test_yc_parser.py"],
}


def build_pytest_command(selection: str) -> list[str]:
    if selection in TEST_SUITES:
        return ["pytest", "-q", *TEST_SUITES[selection]]

    candidate = Path(selection)
    if not candidate.is_absolute():
        candidate = TEST_DIR.parent / candidate

    if candidate.exists():
        relative = candidate.relative_to(TEST_DIR.parent)
        return ["pytest", "-q", str(relative)]

    raise SystemExit(
        f"Unknown test suite '{selection}'. Available: {', '.join(TEST_SUITES)}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run job-agent tests")
    parser.add_argument(
        "suite",
        nargs="?",
        default="all",
        help="Test suite name or path (default: all)",
    )
    args = parser.parse_args()

    command = build_pytest_command(args.suite)
    result = subprocess.run(command, cwd=TEST_DIR.parent)
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
