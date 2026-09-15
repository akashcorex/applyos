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
        if suffix in {".pdf", ".docx", ".tex"}:
            return suffix
    if file_type == "docx":
        return ".docx"
    if file_type == "tex":
        return ".tex"
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


def resume_file_storage_key(
    *, resume_id: str, file_name: str | None, file_type: str | None
) -> str:
    return f"local://resume-files/{resume_id}{extension_for(file_name, file_type)}"


def save_variant_pdf(
    *,
    user_id: str,
    variant_id: str,
    pdf_bytes: bytes,
) -> str:
    user_dir = _UPLOADS_ROOT / _safe_segment(user_id) / "variants"
    user_dir.mkdir(parents=True, exist_ok=True)
    path = user_dir / f"{variant_id}.pdf"
    path.write_bytes(pdf_bytes)
    return str(path.resolve())


def save_artifact_pdf(
    *,
    user_id: str,
    artifact_hash: str,
    pdf_bytes: bytes,
) -> tuple[str, str]:
    """Store a content-addressed artifact and return (opaque key, local path)."""

    user_dir = _UPLOADS_ROOT / _safe_segment(user_id) / "artifacts"
    user_dir.mkdir(parents=True, exist_ok=True)
    path = user_dir / f"{artifact_hash}.pdf"
    if not path.exists():
        path.write_bytes(pdf_bytes)
    return f"local://resume-artifacts/{artifact_hash}.pdf", str(path.resolve())


def resolve_artifact_path(*, user_id: str, artifact_hash: str) -> str | None:
    path = (
        _UPLOADS_ROOT
        / _safe_segment(user_id)
        / "artifacts"
        / f"{artifact_hash}.pdf"
    )
    return str(path.resolve()) if path.is_file() else None


def save_latex_source(
    *,
    user_id: str,
    source_hash: str,
    tex_bytes: bytes,
) -> tuple[str, str]:
    """Store content-addressed LaTeX source, returning (opaque key, local path).

    Mirrors :func:`save_artifact_pdf` under the same per-user scheme. Callers
    must persist only the opaque key; the local path never leaves the service.
    """

    user_dir = _UPLOADS_ROOT / _safe_segment(user_id) / "latex-sources"
    user_dir.mkdir(parents=True, exist_ok=True)
    path = user_dir / f"{_safe_segment(source_hash)}.tex"
    if not path.exists():
        path.write_bytes(tex_bytes)
    return f"local://resume-latex-sources/{source_hash}.tex", str(path.resolve())


def resolve_latex_source_path(*, user_id: str, source_hash: str) -> str | None:
    path = (
        _UPLOADS_ROOT
        / _safe_segment(user_id)
        / "latex-sources"
        / f"{_safe_segment(source_hash)}.tex"
    )
    return str(path.resolve()) if path.is_file() else None


def find_artifact_path(artifact_hash: str) -> str | None:
    """Resolve an artifact by its opaque content address for trusted workers."""

    matches = list(_UPLOADS_ROOT.glob(f"*/artifacts/{_safe_segment(artifact_hash)}.pdf"))
    return str(matches[0].resolve()) if matches and matches[0].is_file() else None
