"""Durable storage for resume files and compiled artifacts.

Primary backend is Cloudflare R2 (via :mod:`services.object_store`) with the
local ``uploads/`` directory kept as a warm cache. When R2 is not configured
the cache is the only store and behavior matches the original local-disk
implementation. See docs/g2-r2-storage-runbook.md.

Object keys are deterministic so any container can rehydrate a file from R2
after a wipe:
- ``resume-files/<user>/<resume_id><ext>``   (original upload)
- ``variant-pdfs/<user>/<variant_id>.pdf``   (tailored variant PDF)
- ``artifacts/<artifact_hash>.pdf``          (content-addressed, shared)
- ``latex-sources/<source_hash>.tex``        (content-addressed, shared)
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from services import object_store

logger = logging.getLogger(__name__)

_UPLOADS_ROOT = Path(__file__).resolve().parents[1] / "uploads"

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".tex": "application/x-tex",
}


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


def _key_prefix() -> str:
    return "r2" if object_store.enabled() else "local"


def _content_type_for(suffix: str) -> str:
    return _CONTENT_TYPES.get(suffix, "application/octet-stream")


def _cache_path(key: str) -> Path:
    """Local cache location for an object key (mirrors the key layout)."""

    relative = key.split("://", 1)[-1]
    return _UPLOADS_ROOT / relative


def _write_cache(key: str, data: bytes) -> str:
    path = _cache_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return str(path.resolve())


def _put_durable(key: str, data: bytes, suffix: str) -> None:
    """Write to R2 when configured; raise on failure so callers never persist
    a file that exists only in a wipeable container. Local cache is best-effort."""

    if object_store.enabled():
        object_store.put_bytes(key, data, _content_type_for(suffix))
    _write_cache(key, data)


def _materialize(key: str) -> str | None:
    """Rehydrate an object from R2 into the local cache on cache miss."""

    if not object_store.enabled():
        return None
    data = object_store.get_bytes(key)
    if data is None:
        return None
    try:
        return _write_cache(key, data)
    except OSError as error:
        logger.warning("Failed to materialize %s into cache: %s", key, error)
        return None


def delete_user_objects(user_id: str) -> int:
    """Delete every user-scoped object (R2 + local cache). Content-addressed
    artifacts and LaTeX sources are shared across users and are not deleted."""

    user_segment = _safe_segment(user_id)
    deleted = 0
    if object_store.enabled():
        for prefix in (f"resume-files/{user_segment}/", f"variant-pdfs/{user_segment}/"):
            deleted += object_store.delete_prefix(prefix)
    cache_dirs = (
        _UPLOADS_ROOT / "resume-files" / user_segment,
        _UPLOADS_ROOT / "variant-pdfs" / user_segment,
        _UPLOADS_ROOT / user_segment,
        _UPLOADS_ROOT / user_segment / "variants",
    )
    for cache_dir in cache_dirs:
        if not cache_dir.is_dir():
            continue
        for item in cache_dir.iterdir():
            if item.is_file():
                item.unlink()
    return deleted


def save_resume_file(
    *,
    user_id: str,
    resume_id: str,
    raw_bytes: bytes,
    file_name: str | None,
    file_type: str | None,
) -> str:
    ext = extension_for(file_name, file_type)
    key = f"resume-files/{_safe_segment(user_id)}/{resume_id}{ext}"
    _put_durable(key, raw_bytes, ext)
    return str(_cache_path(key).resolve())


def resume_file_storage_key(
    *,
    user_id: str,
    resume_id: str,
    file_name: str | None,
    file_type: str | None,
) -> str:
    ext = extension_for(file_name, file_type)
    return (
        f"{_key_prefix()}://resume-files/"
        f"{_safe_segment(user_id)}/{resume_id}{ext}"
    )


def save_variant_pdf(
    *,
    user_id: str,
    variant_id: str,
    pdf_bytes: bytes,
) -> str:
    key = f"variant-pdfs/{_safe_segment(user_id)}/{variant_id}.pdf"
    _put_durable(key, pdf_bytes, ".pdf")
    return str(_cache_path(key).resolve())


def save_artifact_pdf(
    *,
    user_id: str,
    artifact_hash: str,
    pdf_bytes: bytes,
) -> tuple[str, str]:
    """Store a content-addressed artifact and return (opaque key, local path)."""

    del user_id  # artifacts are content-addressed and shared across users
    key = f"artifacts/{_safe_segment(artifact_hash)}.pdf"
    if not object_store.enabled() or not object_store.head_object(key):
        _put_durable(key, pdf_bytes, ".pdf")
    elif not _cache_path(key).exists():
        _write_cache(key, pdf_bytes)
    return f"{_key_prefix()}://{key}", str(_cache_path(key).resolve())


def _legacy_hash_path(pattern: str) -> str | None:
    """Resolve content-addressed files written by the pre-R2 per-user layout
    (uploads/<user>/artifacts|latex-sources/...). Kept so local-only data stays
    readable until it is migrated to R2."""

    matches = sorted(_UPLOADS_ROOT.glob(pattern))
    for match in matches:
        if match.is_file():
            return str(match.resolve())
    return None


def resolve_artifact_path(*, user_id: str, artifact_hash: str) -> str | None:
    del user_id
    key = f"artifacts/{_safe_segment(artifact_hash)}.pdf"
    cached = _cache_path(key)
    if cached.is_file():
        return str(cached.resolve())
    materialized = _materialize(key)
    if materialized:
        return materialized
    return _legacy_hash_path(f"*/artifacts/{_safe_segment(artifact_hash)}.pdf")


def save_latex_source(
    *,
    user_id: str,
    source_hash: str,
    tex_bytes: bytes,
) -> tuple[str, str]:
    """Store content-addressed LaTeX source, returning (opaque key, local path).

    Mirrors :func:`save_artifact_pdf`. Callers must persist only the opaque
    key; the local path never leaves the service.
    """

    del user_id
    key = f"latex-sources/{_safe_segment(source_hash)}.tex"
    if not object_store.enabled() or not object_store.head_object(key):
        _put_durable(key, tex_bytes, ".tex")
    elif not _cache_path(key).exists():
        _write_cache(key, tex_bytes)
    return f"{_key_prefix()}://{key}", str(_cache_path(key).resolve())


def resolve_latex_source_path(*, user_id: str, source_hash: str) -> str | None:
    del user_id
    key = f"latex-sources/{_safe_segment(source_hash)}.tex"
    cached = _cache_path(key)
    if cached.is_file():
        return str(cached.resolve())
    materialized = _materialize(key)
    if materialized:
        return materialized
    return _legacy_hash_path(
        f"*/latex-sources/{_safe_segment(source_hash)}.tex"
    )


def find_artifact_path(artifact_hash: str) -> str | None:
    """Resolve an artifact by its opaque content address for trusted workers."""

    return resolve_artifact_path(user_id="", artifact_hash=artifact_hash)


def ensure_resume_file_local(
    *,
    user_id: str,
    resume_id: str,
    stored_path: str | None,
    file_type: str | None,
) -> str | None:
    """Return a readable local path for the stored source resume, rehydrating
    from R2 when the local cache was wiped."""

    if stored_path and Path(stored_path).is_file():
        return stored_path
    primary = ".tex" if file_type == "tex" else ".docx" if file_type == "docx" else ".pdf"
    for ext in dict.fromkeys([primary, ".pdf", ".docx", ".tex"]):
        key = f"resume-files/{_safe_segment(user_id)}/{resume_id}{ext}"
        materialized = _materialize(key)
        if materialized:
            return materialized
    return None


def ensure_variant_pdf_local(
    *,
    user_id: str,
    variant_id: str,
    stored_path: str | None,
) -> str | None:
    """Return a readable local path for a variant PDF, rehydrating from R2."""

    if stored_path and Path(stored_path).is_file():
        return stored_path
    key = f"variant-pdfs/{_safe_segment(user_id)}/{variant_id}.pdf"
    return _materialize(key)
