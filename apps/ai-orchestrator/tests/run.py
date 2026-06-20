#!/usr/bin/env python3
"""Run ai-orchestrator tests from a single entrypoint."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

TEST_DIR = Path(__file__).resolve().parent
TEST_SUITES: dict[str, list[str]] = {
    "all": ["tests"],
    "filter": ["tests/test_filter.py"],
    "job-client": ["tests/test_job_client.py"],
    "workflow": ["tests/test_workflow.py"],
    "results-consumer": ["tests/test_results_consumer.py"],
    "routes": ["tests/test_routes.py"],
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
    parser = argparse.ArgumentParser(description="Run ai-orchestrator tests")
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
