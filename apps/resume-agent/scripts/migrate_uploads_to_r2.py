"""One-shot migration: push the local uploads/ directory into Cloudflare R2 (G2).

Handles both the legacy layout (uploads/<user>/{file,variants,artifacts,latex-sources})
and the current cache layout (uploads/{resume-files,variant-pdfs,artifacts,latex-sources}).
Objects already present in R2 are skipped unless --force.

Run from apps/resume-agent with R2_* env configured:
    uv run python scripts/migrate_uploads_to_r2.py [--dry-run] [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services import object_store  # noqa: E402

UPLOADS_ROOT = Path(__file__).resolve().parents[1] / "uploads"

CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".tex": "application/x-tex",
}

# (relative directory under uploads/, target key prefix, flatten to key root)
LAYOUT_RULES = [
    # new cache layout first so cache mirrors never migrate twice
    ("resume-files", "resume-files", False),
    ("variant-pdfs", "variant-pdfs", False),
    ("artifacts", "artifacts", True),
    ("latex-sources", "latex-sources", True),
]


def key_for(path: Path, relative_to: Path, prefix: str, flatten: bool) -> str:
    if flatten:
        return f"{prefix}/{path.name}"
    relative = path.relative_to(relative_to).as_posix()
    return f"{prefix}/{relative}"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="re-upload existing objects")
    args = parser.parse_args()

    if not object_store.enabled():
        print("R2 is not configured (R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET).")
        return 1
    if not UPLOADS_ROOT.is_dir():
        print(f"No local uploads directory at {UPLOADS_ROOT} — nothing to migrate.")
        return 0

    uploaded = skipped = 0
    for user_dir in sorted(p for p in UPLOADS_ROOT.iterdir() if p.is_dir()):
        candidates: list[tuple[Path, str, bool]] = []
        # legacy layout: uploads/<user>/<resume>.<ext>, uploads/<user>/{variants,artifacts,latex-sources}/
        for item in sorted(user_dir.iterdir()):
            if item.is_file():
                candidates.append((item, f"resume-files/{user_dir.name}", False))
            elif item.is_dir() and item.name in {"variants", "artifacts", "latex-sources"}:
                prefix = {"variants": "variant-pdfs"}.get(item.name, item.name)
                candidates.extend(
                    (f, prefix, item.name != "variants") for f in sorted(item.rglob("*")) if f.is_file()
                )
        # new cache layout: uploads/{resume-files,variant-pdfs,artifacts,latex-sources}/...
        for relative_dir, prefix, flatten in LAYOUT_RULES:
            base = UPLOADS_ROOT / relative_dir
            if base.is_dir():
                candidates.extend(
                    (f, prefix, flatten) for f in sorted(base.rglob("*")) if f.is_file()
                )

        for path, prefix, flatten in candidates:
            key = key_for(path, UPLOADS_ROOT / prefix.split("/")[0], prefix, flatten)
            if not args.force and object_store.head_object(key):
                skipped += 1
                continue
            if args.dry_run:
                print(f"[dry-run] {path.name} -> {key}")
                uploaded += 1
                continue
            object_store.put_bytes(
                key, path.read_bytes(), CONTENT_TYPES.get(path.suffix, "application/octet-stream")
            )
            print(f"uploaded {key}")
            uploaded += 1

    mode = "would upload" if args.dry_run else "uploaded"
    print(f"\n{mode}: {uploaded}, already in R2 (skipped): {skipped}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
