"""Fortress stealth Chromium process lifecycle (CDP seat per browser launch)."""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import shutil
import socket
import tempfile
from dataclasses import dataclass, field
from pathlib import Path

from app.config import settings

logger = logging.getLogger(__name__)

_PORT_LOCK = asyncio.Lock()
_PORTS_IN_USE: set[int] = set()

_LAUNCHER_NAMES = ("chrome", "tilion", "tilion-fortress", "Chromium")


def seed_for(user_id: str | None) -> int:
    """Stable 32-bit persona seed so one user keeps one machine identity."""
    if not user_id:
        return 0
    digest = hashlib.sha256(user_id.encode()).digest()
    return int.from_bytes(digest[:4], "big") or 1


async def allocate_port(base: int | None = None) -> int:
    """Reserve a free loopback port for a Fortress CDP endpoint."""
    start = settings.fortress_cdp_port_base if base is None else base
    async with _PORT_LOCK:
        for port in range(start, start + 100):
            if port in _PORTS_IN_USE:
                continue
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                try:
                    probe.bind(("127.0.0.1", port))
                except OSError:
                    continue
            _PORTS_IN_USE.add(port)
            return port
    raise RuntimeError(
        f"no free Fortress CDP port in {start}-{start + 99}; lower worker concurrency"
    )


def release_port(port: int) -> None:
    _PORTS_IN_USE.discard(port)


def resolve_binary() -> Path:
    """Return the Fortress chrome binary, or raise with setup instructions."""
    configured = settings.fortress_chrome_bin.strip()
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured).expanduser())
    candidates.append(Path(".fortress/chrome").expanduser())
    for candidate in candidates:
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
        if candidate.is_dir():
            for name in _LAUNCHER_NAMES:
                nested = candidate / name
                if nested.is_file() and os.access(nested, os.X_OK):
                    return nested
    raise RuntimeError(
        "Fortress binary not found. Run `python scripts/setup_fortress.py` "
        "or set FORTRESS_CHROME_BIN to the chrome binary."
    )


@dataclass
class FortressSeat:
    """A spawned Fortress process exposing one CDP endpoint."""

    port: int
    profile_dir: Path
    log_path: Path
    process: asyncio.subprocess.Process
    extra: dict = field(default_factory=dict)

    @property
    def cdp_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    async def stop(self) -> None:
        try:
            if self.process.returncode is None:
                self.process.terminate()
                try:
                    await asyncio.wait_for(self.process.wait(), timeout=10)
                except asyncio.TimeoutError:
                    self.process.kill()
                    await self.process.wait()
        except ProcessLookupError:
            pass
        finally:
            release_port(self.port)
            shutil.rmtree(self.profile_dir, ignore_errors=True)

    def log_tail(self, limit: int = 2000) -> str:
        try:
            return self.log_path.read_text(errors="replace")[-limit:]
        except OSError:
            return ""


def build_args(
    binary: Path,
    port: int,
    profile_dir: Path,
    user_id: str | None,
    headless: bool,
) -> list[str]:
    args = [
        str(binary),
        f"--remote-debugging-port={port}",
        f"--user-data-dir={profile_dir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--no-sandbox",
        "--disable-dev-shm-usage",
    ]
    if headless:
        args.append("--headless=new")
    args += [f"--uxr-country={settings.fortress_country}"]
    seed = seed_for(user_id)
    if seed:
        args.append(f"--uxr-seed={seed}")
    return args


async def _wait_for_cdp(port: int, timeout: float) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.close()
            await writer.wait_closed()
            return
        except OSError:
            await asyncio.sleep(0.25)
    raise TimeoutError(f"Fortress CDP endpoint on :{port} did not come up in {timeout}s")


async def start(user_id: str | None = None, headless: bool | None = None) -> FortressSeat:
    """Spawn Fortress with a per-user persona and wait for its CDP port."""
    binary = resolve_binary()
    port = await allocate_port()
    base = Path(settings.fortress_profile_dir).expanduser() if settings.fortress_profile_dir else None
    profile_dir = Path(tempfile.mkdtemp(prefix=f"fortress-{port}-", dir=base))
    log_path = profile_dir / "fortress.log"
    log_file = log_path.open("wb")
    args = build_args(binary, port, profile_dir, user_id, headless)
    logger.info(
        "Starting Fortress (port=%s, seed=%s, country=%s)",
        port,
        seed_for(user_id),
        settings.fortress_country,
    )
    try:
        process = await asyncio.create_subprocess_exec(
            *args,
            stdout=log_file,
            stderr=log_file,
            start_new_session=True,
        )
    except Exception:
        log_file.close()
        release_port(port)
        shutil.rmtree(profile_dir, ignore_errors=True)
        raise

    seat = FortressSeat(port=port, profile_dir=profile_dir, log_path=log_path, process=process)
    try:
        await _wait_for_cdp(port, settings.fortress_cdp_timeout_seconds)
    except TimeoutError:
        tail = seat.log_tail()
        await seat.stop()
        raise RuntimeError(f"Fortress failed to start.\n{tail}") from None
    finally:
        log_file.close()
    return seat
