#!/usr/bin/env python3
"""Run workspace tests from a single root entrypoint."""

from __future__ import annotations

import argparse
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TESTS_DIR = ROOT / "tests"

APP_CONFIG = {
    "job-agent": {
        "cwd": ROOT / "apps" / "job-agent",
        "glob": "test_job_agent_*.py",
    },
    "ai-orchestrator": {
        "cwd": ROOT / "apps" / "ai-orchestrator",
        "glob": "test_ai_orchestrator_*.py",
    },
    "resume-agent": {
        "cwd": ROOT / "apps" / "resume-agent",
        "glob": "test_resume_agent_*.py",
    },
    "outreach-agent": {
        "cwd": ROOT / "apps" / "outreach-agent",
        "glob": "test_outreach_agent_*.py",
    },
}

NAMED_SUITES: dict[str, tuple[str, str]] = {
    "job-agent-dedup": ("job-agent", "test_job_agent_dedup.py"),
    "job-agent-detect": ("job-agent", "test_job_agent_detect.py"),
    "job-agent-fetch-base": ("job-agent", "test_job_agent_fetch_base.py"),
    "job-agent-funding-parsers": ("job-agent", "test_job_agent_funding_parsers.py"),
    "job-agent-ingest-route": ("job-agent", "test_job_agent_ingest_route.py"),
    "job-agent-normalizer": ("job-agent", "test_job_agent_normalizer.py"),
    "job-agent-parsers": ("job-agent", "test_job_agent_parsers.py"),
    "job-agent-yc-parser": ("job-agent", "test_job_agent_yc_parser.py"),
    "ai-orchestrator-filter": ("ai-orchestrator", "test_ai_orchestrator_filter.py"),
    "ai-orchestrator-job-client": ("ai-orchestrator", "test_ai_orchestrator_job_client.py"),
    "ai-orchestrator-results-consumer": (
        "ai-orchestrator",
        "test_ai_orchestrator_results_consumer.py",
    ),
    "ai-orchestrator-routes": ("ai-orchestrator", "test_ai_orchestrator_routes.py"),
    "ai-orchestrator-workflow": ("ai-orchestrator", "test_ai_orchestrator_workflow.py"),
    "resume-agent-parser": ("resume-agent", "test_resume_agent_parser.py"),
    "resume-agent-extractor": ("resume-agent", "test_resume_agent_extractor.py"),
    "resume-agent-matcher": ("resume-agent", "test_resume_agent_matcher.py"),
    "resume-agent-chunker": ("resume-agent", "test_resume_agent_chunker.py"),
    "resume-agent-compile-jobs": ("resume-agent", "test_resume_agent_compile_jobs.py"),
    "ai-orchestrator-graph": ("ai-orchestrator", "test_ai_orchestrator_graph.py"),
    "ai-orchestrator-decision-policy": (
        "ai-orchestrator",
        "test_ai_orchestrator_decision_policy.py",
    ),
    "job-agent-semantic": ("job-agent", "test_job_agent_semantic.py"),
    "job-agent-board-audit": ("job-agent", "test_job_agent_board_audit.py"),
    "job-agent-growth": ("job-agent", "test_job_agent_growth.py"),
    "outreach-agent-message": ("outreach-agent", "test_outreach_agent_message.py"),
}


def _sync_app(app: str) -> int:
    cwd = APP_CONFIG[app]["cwd"]
    result = subprocess.run(["uv", "sync", "--extra", "dev"], cwd=cwd)
    return result.returncode


def _resolve_files(app: str, filenames: list[str] | None = None) -> list[Path]:
    if filenames:
        return [TESTS_DIR / name for name in filenames]

    glob_pattern = APP_CONFIG[app]["glob"]
    return sorted(TESTS_DIR.glob(glob_pattern))


def _run_pytest(app: str, test_files: list[Path]) -> int:
    cwd = APP_CONFIG[app]["cwd"]
    env = os.environ.copy()
    env["PYTHONPATH"] = str(cwd)
    command = ["uv", "run", "pytest", "-q", *[str(path) for path in test_files]]
    result = subprocess.run(command, cwd=cwd, env=env)
    return result.returncode


def run_suite(selection: str) -> int:
    if selection == "all":
        exit_code = 0
        for app in APP_CONFIG:
            code = run_app(app)
            if code != 0:
                exit_code = code
        return exit_code

    if selection in APP_CONFIG:
        return run_app(selection)

    if selection in NAMED_SUITES:
        app, filename = NAMED_SUITES[selection]
        return run_app(app, [filename])

    candidate = Path(selection)
    if not candidate.is_absolute():
        candidate = TESTS_DIR / candidate

    if candidate.exists() and candidate.name.startswith("test_"):
        if candidate.name.startswith("test_job_agent_"):
            return run_app("job-agent", [candidate.name])
        if candidate.name.startswith("test_ai_orchestrator_"):
            return run_app("ai-orchestrator", [candidate.name])
        if candidate.name.startswith("test_resume_agent_"):
            return run_app("resume-agent", [candidate.name])
        if candidate.name.startswith("test_outreach_agent_"):
            return run_app("outreach-agent", [candidate.name])

    available = sorted([*APP_CONFIG, *NAMED_SUITES, "all"])
    raise SystemExit(
        f"Unknown test suite '{selection}'. Available: {', '.join(available)}"
    )


def run_app(app: str, filenames: list[str] | None = None) -> int:
    sync_code = _sync_app(app)
    if sync_code != 0:
        return sync_code

    test_files = _resolve_files(app, filenames)
    if not test_files:
        raise SystemExit(f"No test files found for app '{app}'")

    missing = [path for path in test_files if not path.exists()]
    if missing:
        missing_names = ", ".join(path.name for path in missing)
        raise SystemExit(f"Missing test files for app '{app}': {missing_names}")

    return _run_pytest(app, test_files)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run workspace tests")
    parser.add_argument(
        "suite",
        nargs="?",
        default="all",
        help="Suite name, app name, or test file (default: all)",
    )
    args = parser.parse_args()
    return run_suite(args.suite)


if __name__ == "__main__":
    raise SystemExit(main())
