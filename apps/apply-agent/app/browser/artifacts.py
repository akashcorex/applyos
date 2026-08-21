"""Capture page URL and screenshot for failed or blocked applications."""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import settings

logger = logging.getLogger(__name__)


def artifact_root() -> Path:
    return Path(settings.artifact_dir).expanduser()


def _safe_job_id(job_id: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "_", job_id)[:120]


async def capture_failure_artifacts(
    page: Any,
    job_id: str,
) -> tuple[str | None, str | None]:
    """Return ``(page_url, screenshot_path)`` without raising into the apply flow."""
    if page is None:
        return None, None

    page_url: str | None = None
    try:
        page_url = page.url
    except Exception:
        page_url = None

    try:
        folder = artifact_root() / _safe_job_id(job_id)
        folder.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        path = folder / f"{stamp}.png"
        await page.screenshot(path=str(path), full_page=True)
        return page_url, str(path)
    except Exception as exc:
        logger.warning("Could not capture apply screenshot for %s: %s", job_id, exc)
        return page_url, None


def resolve_artifact_path(job_id: str, filename: str) -> Path | None:
    """Return a screenshot path only when it stays inside the artifact root."""
    if "/" in filename or "\\" in filename or filename.startswith("."):
        return None
    candidate = (artifact_root() / _safe_job_id(job_id) / filename).resolve()
    try:
        candidate.relative_to(artifact_root().resolve())
    except ValueError:
        return None
    return candidate if candidate.is_file() else None
