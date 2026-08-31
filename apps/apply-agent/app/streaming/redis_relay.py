"""Redis pub/sub relay for screencast frames and input across Celery/API processes."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import redis.asyncio as aioredis
from playwright.async_api import Page

from app.browser.session_registry import ControlMode
from app.config import settings
from app.streaming.input_relay import relay_input
from app.streaming.screencast import ScreencastStreamer

logger = logging.getLogger(__name__)

_SCREENCAST_PREFIX = "screencast"
_INPUT_PREFIX = "screencast_input"
_SESSION_PREFIX = "browser_session"


def screencast_channel(application_id: str) -> str:
    return f"{_SCREENCAST_PREFIX}:{application_id}"


def input_channel(application_id: str) -> str:
    return f"{_INPUT_PREFIX}:{application_id}"


def session_metadata_key(application_id: str) -> str:
    return f"{_SESSION_PREFIX}:{application_id}"


class WorkerStreamRelay:
    """Publishes screencast frames and consumes remote input in the Celery worker."""

    def __init__(self, application_id: str, page: Page) -> None:
        self.application_id = application_id
        self.page = page
        self._streamer: ScreencastStreamer | None = None
        self._tasks: list[asyncio.Task[None]] = []
        self._running = False
        self._control_mode = ControlMode.AGENT

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._streamer = ScreencastStreamer(self.page)
        await self._streamer.start()
        self._tasks = [
            asyncio.create_task(self._publish_frames()),
            asyncio.create_task(self._consume_input()),
        ]
        logger.info(
            "Worker stream relay started application_id=%s", self.application_id
        )

    async def stop(self) -> None:
        self._running = False
        for task in self._tasks:
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks, return_exceptions=True)
        self._tasks.clear()
        if self._streamer is not None:
            await self._streamer.stop()
            self._streamer = None

    def set_control_mode(self, mode: ControlMode) -> None:
        self._control_mode = mode

    async def _publish_frames(self) -> None:
        if self._streamer is None:
            return
        r = aioredis.from_url(settings.redis_url)
        channel = screencast_channel(self.application_id)
        try:
            async for frame in self._streamer.frames():
                if not self._running:
                    break
                try:
                    await r.publish(channel, frame)
                except Exception:
                    logger.exception(
                        "Failed to publish screencast frame application_id=%s",
                        self.application_id,
                    )
        finally:
            await r.aclose()

    async def _consume_input(self) -> None:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        pubsub = r.pubsub()
        channel = input_channel(self.application_id)
        try:
            await pubsub.subscribe(channel)
            while self._running:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
                if not message or message.get("type") != "message":
                    continue
                try:
                    payload = json.loads(message["data"])
                except json.JSONDecodeError:
                    continue
                if payload.get("type") == "control_mode":
                    mode = payload.get("mode")
                    if mode == ControlMode.HUMAN.value:
                        self._control_mode = ControlMode.HUMAN
                    elif mode == ControlMode.AGENT.value:
                        self._control_mode = ControlMode.AGENT
                    continue
                await relay_input(
                    self.page,
                    payload,
                    control_mode=self._control_mode,
                )
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
            await r.aclose()


_worker_relays: dict[str, WorkerStreamRelay] = {}


async def start_worker_stream_relay(application_id: str, page: Page) -> WorkerStreamRelay:
    existing = _worker_relays.get(application_id)
    if existing is not None:
        return existing
    relay = WorkerStreamRelay(application_id, page)
    await relay.start()
    _worker_relays[application_id] = relay
    return relay


async def stop_worker_stream_relay(application_id: str) -> None:
    relay = _worker_relays.pop(application_id, None)
    if relay is not None:
        await relay.stop()


def sync_worker_control_mode(application_id: str, mode: ControlMode) -> None:
    relay = _worker_relays.get(application_id)
    if relay is not None:
        relay.set_control_mode(mode)


async def publish_control_mode(application_id: str, mode: ControlMode) -> None:
    """Notify the worker process of a control-mode change."""
    sync_worker_control_mode(application_id, mode)
    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        await r.publish(
            input_channel(application_id),
            json.dumps({"type": "control_mode", "mode": mode.value}),
        )
        key = session_metadata_key(application_id)
        raw = await r.get(key)
        if raw:
            payload = json.loads(raw)
            payload["controlMode"] = mode.value
            await r.set(key, json.dumps(payload), ex=settings.browser_session_ttl_seconds)
    finally:
        await r.aclose()


async def relay_websocket_session(
    websocket: Any,
    application_id: str,
) -> None:
    """Subscribe to Redis screencast frames and forward browser input."""
    r = aioredis.from_url(settings.redis_url)
    r_text = aioredis.from_url(settings.redis_url, decode_responses=True)
    pubsub = r.pubsub()
    channel = screencast_channel(application_id)
    await pubsub.subscribe(channel)

    async def forward_frames() -> None:
        try:
            while True:
                message = await pubsub.get_message(
                    ignore_subscribe_messages=True,
                    timeout=1.0,
                )
                if message and message.get("type") == "message":
                    data = message.get("data")
                    if isinstance(data, (bytes, bytearray)):
                        await websocket.send_bytes(data)
                    elif isinstance(data, str):
                        await websocket.send_bytes(data.encode("latin-1"))
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "Redis screencast forward failed application_id=%s", application_id
            )

    async def forward_input() -> None:
        try:
            while True:
                raw = await websocket.receive_text()
                await r_text.publish(input_channel(application_id), raw)
        except asyncio.CancelledError:
            raise
        except Exception:
            pass

    frame_task = asyncio.create_task(forward_frames())
    input_task = asyncio.create_task(forward_input())
    try:
        await asyncio.wait(
            {frame_task, input_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        frame_task.cancel()
        input_task.cancel()
        await asyncio.gather(frame_task, input_task, return_exceptions=True)
        await pubsub.unsubscribe(channel)
        await pubsub.aclose()
        await r.aclose()
        await r_text.aclose()
