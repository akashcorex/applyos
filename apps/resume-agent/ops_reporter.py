"""Background ops reporter: heartbeat + process metrics to the API every 60s."""

from __future__ import annotations

import asyncio
import logging
import os
import platform
import time
from typing import Awaitable, Callable

import httpx

logger = logging.getLogger(__name__)

REPORT_INTERVAL_SECONDS = 60.0

ExtraMetrics = Callable[[], Awaitable[dict[str, float]]]


def _process_metrics(started_at: float) -> dict[str, float]:
    metrics: dict[str, float] = {
        "process.uptime_seconds": max(0.0, time.monotonic() - started_at),
    }
    try:
        import resource

        rss_kb = float(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)
        if platform.system() == "Darwin" and rss_kb:
            # ru_maxrss is bytes on macOS but KB on Linux
            rss_kb /= 1024.0
        metrics["process.max_rss_kb"] = rss_kb
    except Exception:
        logger.debug("resource metrics unavailable", exc_info=True)
    return metrics


async def _report_once(
    client: httpx.AsyncClient,
    base_url: str,
    service: str,
    started_at: float,
    extra_metrics: ExtraMetrics | None,
) -> None:
    metrics = _process_metrics(started_at)
    if extra_metrics is not None:
        try:
            metrics.update(await extra_metrics())
        except Exception:
            logger.warning("ops extra metrics failed", exc_info=True)
    try:
        heartbeat = await client.post(
            f"{base_url}/v1/internal/ops/heartbeat",
            json={"service": service, "status": "ok", "meta": {"pid": os.getpid()}},
        )
        heartbeat.raise_for_status()
        samples = [
            {"metric": name, "value": float(value)}
            for name, value in sorted(metrics.items())
        ]
        report = await client.post(
            f"{base_url}/v1/internal/ops/metrics",
            json={"service": service, "metrics": samples},
        )
        report.raise_for_status()
    except Exception:
        logger.warning("ops report to %s failed", base_url, exc_info=True)


async def run_ops_reporter(
    service: str,
    api_url: str,
    agent_service_token: str,
    extra_metrics: ExtraMetrics | None = None,
    interval_seconds: float = REPORT_INTERVAL_SECONDS,
    transport: httpx.AsyncBaseTransport | None = None,
) -> None:
    """Loop forever; report failures are logged, never raised to the caller."""
    started_at = time.monotonic()
    base_url = api_url.rstrip("/")
    async with httpx.AsyncClient(
        timeout=10.0,
        headers={"x-agent-service-token": agent_service_token},
        transport=transport,
    ) as client:
        while True:
            await _report_once(client, base_url, service, started_at, extra_metrics)
            await asyncio.sleep(interval_seconds)


def start_ops_reporter(
    service: str,
    api_url: str,
    agent_service_token: str,
    extra_metrics: ExtraMetrics | None = None,
) -> asyncio.Task[None] | None:
    """Start the reporter as an asyncio task; None when not configured."""
    if not api_url or not agent_service_token:
        logger.info(
            "Ops reporter disabled for %s: API_URL or AGENT_SERVICE_TOKEN unset",
            service,
        )
        return None
    return asyncio.create_task(
        run_ops_reporter(service, api_url, agent_service_token, extra_metrics)
    )
