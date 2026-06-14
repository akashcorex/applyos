"""Helpers for resolving and preparing resume files for upload."""

from __future__ import annotations

import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.models.job_payload import CVData

_WORKSPACE_ROOT = Path(__file__).resolve().parents[4]


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


def _default_resume_path() -> Path | None:
    configured = getattr(settings, "default_resume_path", "")
    if configured:
        path = _resolve_local_candidate(configured)
        if path is not None:
            return path

    explicit_default = _WORKSPACE_ROOT / "pahari's resume.pdf"
    if explicit_default.exists() and explicit_default.is_file():
        return explicit_default

    root_pdfs = sorted(_WORKSPACE_ROOT.glob("*.pdf"))
    if len(root_pdfs) == 1:
        return root_pdfs[0]

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


async def _download_resume(source: str) -> Path:
    async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
        response = await client.get(source)
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
    3. ``settings.default_resume_path`` if configured
    4. current workspace fallback PDF for local development
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
                temporary_path = await _download_resume(source)
                yield temporary_path
                return

        default_path = _default_resume_path()
        yield default_path
    finally:
        if temporary_path is not None and temporary_path.exists():
            temporary_path.unlink(missing_ok=True)
