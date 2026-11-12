"""Download and verify a Fortress Chromium release bundle.

    python scripts/setup_fortress.py            # pinned tag, current platform
    python scripts/setup_fortress.py --tag v156.0.8078.47

Prints the resolved chrome binary; export it as FORTRESS_CHROME_BIN.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform as _platform
import stat
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

REPO = "tiliondev/fortress"
DEFAULT_TAG = "v153.0.8010.36"
ROOT = Path(__file__).resolve().parent.parent / ".fortress"

_PLATFORM_TOKENS = {
    ("Linux", "x86_64"): "linux-x64",
    ("Linux", "amd64"): "linux-x64",
    ("Linux", "aarch64"): "linux-arm64",
    ("Darwin", "arm64"): "mac-arm64",
    ("Darwin", "x86_64"): "mac-x64",
    ("Windows", "amd64"): "win-x64",
}


def platform_token() -> str:
    machine = _platform.machine().lower()
    key = (_platform.system(), machine)
    if key not in _PLATFORM_TOKENS:
        raise SystemExit(f"unsupported platform: {key[0]} {key[1]}")
    return _PLATFORM_TOKENS[key]


def _get(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "apply-agent-setup"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def pick_asset(tag: str, token: str) -> str:
    payload = json.loads(
        _get(f"https://api.github.com/repos/{REPO}/releases/tags/{tag}")
    )
    names = [asset["name"] for asset in payload.get("assets", [])]
    matches = [n for n in names if token in n and n.endswith((".tar.gz", ".zip"))]
    if not matches:
        raise SystemExit(f"no {token} asset in {tag}; available: {names}")
    return sorted(matches, key=len)[0]


def verify(path: Path, asset: str, tag: str) -> None:
    sums = _get(f"https://github.com/{REPO}/releases/download/{tag}/SHA256SUMS").decode()
    expected = None
    for line in sums.splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[1].lstrip("*") == asset:
            expected = parts[0].lower()
    if not expected:
        raise SystemExit(f"{asset} missing from SHA256SUMS")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected:
        path.unlink(missing_ok=True)
        raise SystemExit(f"SHA256 mismatch for {asset}")
    print(f"sha256 ok: {asset}")


def extract(archive: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    if archive.name.endswith(".zip"):
        with zipfile.ZipFile(archive) as bundle:
            bundle.extractall(dest)
    else:
        with tarfile.open(archive) as bundle:
            bundle.extractall(dest)
    archive.unlink(missing_ok=True)


def find_chrome(dest: Path) -> Path:
    for name in ("chrome", "Chromium", "tilion"):
        for candidate in dest.rglob(name):
            if candidate.is_file():
                return candidate
    for candidate in dest.rglob("Chromium.app/Contents/MacOS/Chromium"):
        return candidate
    raise SystemExit(f"chrome binary not found under {dest}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tag", default=DEFAULT_TAG)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    dest = ROOT / args.tag
    existing = list(dest.rglob("chrome")) + list(dest.rglob("Chromium"))
    if existing and not args.force:
        print(f"already installed: {existing[0]}")
        return

    token = platform_token()
    asset = pick_asset(args.tag, token)
    dest.mkdir(parents=True, exist_ok=True)
    archive = dest / asset
    print(f"downloading {asset} ...")
    urllib.request.urlretrieve(
        f"https://github.com/{REPO}/releases/download/{args.tag}/{asset}", archive
    )
    verify(archive, asset, args.tag)
    extract(archive, dest)
    chrome = find_chrome(dest)
    chrome.chmod(chrome.stat().st_mode | stat.S_IEXEC)

    launcher = dest / "run-fortress"
    launcher.write_text(
        "#!/bin/sh\n"
        f'exec "{chrome}" "$@" --user-data-dir="${{FORTRESS_PROFILE:-/tmp/fortress-profile}}" '
        "--no-first-run --no-default-browser-check --no-sandbox\n"
    )
    launcher.chmod(0o755)

    print(f"\nchrome: {chrome}")
    print(f"launcher: {launcher}")
    print(f"\nexport FORTRESS_CHROME_BIN={chrome}")


if __name__ == "__main__":
    sys.exit(main())
