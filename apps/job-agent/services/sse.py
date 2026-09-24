"""Minimal server-sent event helpers."""

from __future__ import annotations

import json
from typing import Any


def format_sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def parse_sse_frames(text: str) -> list[tuple[str, dict[str, Any]]]:
    """Parse buffered SSE text into (event, payload) pairs."""
    frames: list[tuple[str, dict[str, Any]]] = []
    for chunk in text.split("\n\n"):
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
    return frames
