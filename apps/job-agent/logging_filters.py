"""Logging filters shared by agent entrypoints."""

from __future__ import annotations

import logging


class SuppressHealthAccessFilter(logging.Filter):
    """Drop uvicorn access lines for liveness probes so real work stays visible."""

    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return "/health" not in message and 'GET / HTTP' not in message


def install_health_access_filter() -> None:
    logging.getLogger("uvicorn.access").addFilter(SuppressHealthAccessFilter())
