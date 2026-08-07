"""Persist uploaded resume files on local disk for ATS apply."""

from __future__ import annotations

import re
from pathlib import Path

_UPLOADS_ROOT = Path(__file__).resolve().parents[1] / "uploads"


def _safe_segment(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9._-]+", "_", value.strip())
    return cleaned[:128] or "unknown"


def extension_for(file_name: str | None, file_type: str | None) -> str:
    if file_name and "." in file_name:
        suffix = Path(file_name).suffix.lower()
        if suffix in {".pdf", ".docx"}:
            return suffix
    if file_type == "docx":
        return ".docx"
    return ".pdf"


def save_resume_file(
    *,
    user_id: str,
    resume_id: str,
    raw_bytes: bytes,
    file_name: str | None,
    file_type: str | None,
) -> str:
    user_dir = _UPLOADS_ROOT / _safe_segment(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    ext = extension_for(file_name, file_type)
    path = user_dir / f"{resume_id}{ext}"
    path.write_bytes(raw_bytes)
    return str(path.resolve())
