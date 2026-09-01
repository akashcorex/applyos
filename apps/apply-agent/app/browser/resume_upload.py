"""Helpers for resolving and preparing resume files for upload."""

from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse

import httpx
from playwright.async_api import Page

from app.config import settings
from app.models.job_payload import CVData

def _workspace_root() -> Path:
    here = Path(__file__).resolve()
    for parent in here.parents:
        if (parent / "apps" / "apply-agent").is_dir():
            return parent
    # Docker copies apply-agent to /app, so this file is /app/app/browser/...
    return here.parents[2] if len(here.parents) >= 3 else here.parent


_WORKSPACE_ROOT = _workspace_root()


def _resolve_local_candidate(source: str) -> Path | None:
    raw = source.strip()
    if not raw:
        return None

    if raw.startswith("file://"):
        parsed = urlparse(raw)
        raw = parsed.path

    candidate = Path(raw).expanduser()
    candidates = [candidate]
    if not candidate.is_absolute():
        candidates.append((_WORKSPACE_ROOT / candidate).resolve())

    for path in candidates:
        if path.exists() and path.is_file():
            return path

    return None


def _guess_suffix(source: str, content_type: str | None) -> str:
    parsed = urlparse(source)
    suffix = Path(parsed.path).suffix
    if suffix:
        return suffix

    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";", 1)[0].strip())
        if guessed:
            return guessed

    return ".pdf"


async def _download_resume(source: str, headers: dict[str, str] | None = None) -> Path:
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        response = await client.get(source, headers=headers)
        response.raise_for_status()
        suffix = _guess_suffix(source, response.headers.get("content-type"))
        with NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_file.write(response.content)
            return Path(temp_file.name)


@asynccontextmanager
async def prepare_resume_file(cv_data: CVData):
    """Yield a local file path that Playwright can upload.

    Resolution order:
    1. ``cv_data.resume_url`` if it points to a local path
    2. ``cv_data.resume_url`` if it is an HTTP(S) URL (downloaded to a temp file)
    3. No fallback — every apply must reference a compiled artifact.

    Yields ``None`` when no resume file can be resolved.
    """
    temporary_path: Path | None = None

    source = (cv_data.resume_url or "").strip()
    try:
        if source:
            local = _resolve_local_candidate(source)
            if local is not None:
                yield local
                return

            if source.startswith("http://") or source.startswith("https://"):
                headers: dict[str, str] | None = None
                if source.startswith(settings.resume_agent_url.rstrip("/")):
                    if not settings.agent_service_token:
                        raise RuntimeError(
                            "AGENT_SERVICE_TOKEN is required for resume artifact downloads"
                        )
                    headers = {
                        "X-Agent-Service-Token": settings.agent_service_token,
                    }
                temporary_path = await _download_resume(source, headers=headers)
                yield temporary_path
                return

        yield None
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)


async def upload_resume_to_file_inputs(page: Page, resume_path: Path) -> bool:
    """Attach ``resume_path`` to the first available ``input[type=file]``."""
    file_inputs = await page.query_selector_all("input[type='file']")
    if not file_inputs:
        return False

    for file_input in file_inputs:
        await file_input.set_input_files(str(resume_path))
        uploaded = await file_input.evaluate(
            "el => Boolean(el.files && el.files.length > 0)"
        )
        if uploaded:
            return True
    return False


async def require_resume_upload(page: Page, cv_data: CVData, ats_name: str):
    """Upload resume when file inputs exist.

    Returns ``(ok, error_message, fields_filled_delta)``.
    ``ok=True`` and ``error_message=None`` when there is no file input,
    or when upload succeeds.
    """
    has_file_input = (await page.query_selector("input[type='file']")) is not None
    if not has_file_input:
        return True, None, 0

    async with prepare_resume_file(cv_data) as resume_path:
        if resume_path is None:
            return False, "Resume file not available for upload", 0
        uploaded = await upload_resume_to_file_inputs(page, resume_path)
        if not uploaded:
            return False, f"Failed to attach resume on {ats_name}", 0
        return True, None, 1
