"""CDP screencast streaming for live browser view."""

from __future__ import annotations

import asyncio
import base64
import logging
from collections.abc import AsyncIterator

from playwright.async_api import Page

logger = logging.getLogger(__name__)

_DEFAULT_QUALITY = 75
_DEFAULT_EVERY_NTH_FRAME = 2


class ScreencastStreamer:
    """Streams JPEG frames from a Playwright page via CDP screencast."""

    def __init__(self, page: Page) -> None:
        self._page = page
        self._queue: asyncio.Queue[bytes | None] = asyncio.Queue(maxsize=8)
        self._cdp = None
        self._running = False
        self._task: asyncio.Task[None] | None = None

    async def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._cdp = await self._page.context.new_cdp_session(self._page)

        def on_frame(params: dict) -> None:
            data = params.get("data")
            session_id = params.get("sessionId")
            if not data or not session_id:
                return
            try:
                frame_bytes = base64.b64decode(data)
                if self._queue.full():
                    try:
                        self._queue.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                self._queue.put_nowait(frame_bytes)
            except Exception:
                logger.exception("Failed to decode screencast frame")
            finally:
                asyncio.create_task(
                    self._ack_frame(session_id),
                )

        self._cdp.on("Page.screencastFrame", on_frame)
        await self._cdp.send(
            "Page.startScreencast",
            {
                "format": "jpeg",
                "quality": _DEFAULT_QUALITY,
                "everyNthFrame": _DEFAULT_EVERY_NTH_FRAME,
            },
        )
        logger.info("Screencast started for page url=%s", self._page.url)

    async def _ack_frame(self, session_id: str) -> None:
        if self._cdp is None:
            return
        try:
            await self._cdp.send(
                "Page.screencastFrameAck",
                {"sessionId": session_id},
            )
        except Exception:
            pass

    async def stop(self) -> None:
        self._running = False
        if self._cdp is not None:
            try:
                await self._cdp.send("Page.stopScreencast")
            except Exception:
                pass
            try:
                await self._cdp.detach()
            except Exception:
                pass
            self._cdp = None
        await self._queue.put(None)

    async def frames(self) -> AsyncIterator[bytes]:
        while self._running:
            frame = await self._queue.get()
            if frame is None:
                break
            yield frame


# Active streamers keyed by application_id
_streamers: dict[str, ScreencastStreamer] = {}


async def get_or_start_streamer(application_id: str) -> ScreencastStreamer | None:
    from app.browser.session_registry import session_registry

    existing = _streamers.get(application_id)
    if existing is not None:
        return existing

    session = await session_registry.get(application_id)
    if session is None:
        return None

    streamer = ScreencastStreamer(session.page)
    await streamer.start()
    _streamers[application_id] = streamer
    return streamer


async def stop_streamer(application_id: str) -> None:
    streamer = _streamers.pop(application_id, None)
    if streamer is not None:
        await streamer.stop()
