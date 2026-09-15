"""Isolated LaTeX compilation worker.

The API process launches this module as a subprocess. It receives only a
temporary source/output directory, runs without shell escape, and applies
resource limits where the host supports them.
"""

from __future__ import annotations

import argparse
import os
import resource
import subprocess
from pathlib import Path


def _limit_resources(cpu_seconds: int = 12) -> None:
    try:
        resource.setrlimit(resource.RLIMIT_CPU, (cpu_seconds, cpu_seconds))
        resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    except (AttributeError, OSError, ValueError):
        pass


DEFAULT_TIMEOUT_SECONDS = 15.0


def compile_latex(
    compiler: str,
    source: Path,
    output_dir: Path,
    timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = Path(
        os.environ.get("TECTONIC_CACHE_DIR") or output_dir / "tectonic-cache"
    )
    cache_dir.mkdir(parents=True, exist_ok=True)
    command_name = Path(compiler).name.lower()
    if "tectonic" in command_name:
        command = [
            compiler,
            "-X",
            "compile",
            "--untrusted",
            "--outdir",
            str(output_dir),
            str(source),
        ]
    else:
        command = [
            compiler,
            "-interaction=nonstopmode",
            "-halt-on-error",
            "-no-shell-escape",
            "-output-directory",
            str(output_dir),
            str(source),
        ]
    env = {
        "PATH": os.environ.get("PATH", ""),
        "HOME": str(output_dir),
        "TEXMFHOME": str(output_dir / "texmf"),
        "TECTONIC_CACHE_DIR": str(cache_dir),
    }
    # Inherit stdout/stderr so the parent captures the compiler log.
    subprocess.run(
        command,
        cwd=source.parent,
        env=env,
        check=True,
        timeout=timeout,
        start_new_session=True,
        preexec_fn=lambda: _limit_resources(max(12, int(timeout) + 1)),
    )
    output = output_dir / "resume.pdf"
    if not output.is_file():
        raise RuntimeError("LaTeX compiler did not produce resume.pdf")
    return output


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--compiler", required=True)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--timeout", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    args = parser.parse_args()
    compile_latex(args.compiler, args.source, args.output_dir, timeout=args.timeout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
