"""Minimal server-sent event helpers (mirror of job-agent's)."""

from __future__ import annotations

import json
from typing import Any


def format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def parse_sse_buffer(text: str) -> tuple[list[tuple[str, dict[str, Any]]], str]:
    """Extract complete frames; return (frames, leftover)."""
    frames: list[tuple[str, dict[str, Any]]] = []
    parts = text.split("\n\n")
    leftover = parts.pop()
    for chunk in parts:
        name: str | None = None
        payload: dict[str, Any] | None = None
        for line in chunk.splitlines():
            if line.startswith("event:"):
                name = line[len("event:") :].strip()
            elif line.startswith("data:"):
                try:
                    parsed = json.loads(line[len("data:") :].strip())
                except json.JSONDecodeError:
                    parsed = None
                if isinstance(parsed, dict):
                    payload = parsed
        if name is not None and payload is not None:
            frames.append((name, payload))
    return frames, leftover
