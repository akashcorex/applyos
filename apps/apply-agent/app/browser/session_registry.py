"""In-process registry for persistent per-application browser sessions."""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from enum import Enum
from uuid import uuid4

import redis.asyncio as aioredis
from playwright.async_api import Browser, BrowserContext, Page

from app.config import settings

logger = logging.getLogger(__name__)

_REDIS_PREFIX = "browser_session"
_TTL_SECONDS = 60 * 60 * 2  # refreshed on activity


class ControlMode(str, Enum):
    AGENT = "agent_control"
    HUMAN = "human_control"


@dataclass
class BrowserSession:
    """Live browser state for one application."""

    application_id: str
    browser_session_id: str
    browser: Browser
    context: BrowserContext
    page: Page
    control_mode: ControlMode = ControlMode.AGENT
    worker_id: str | None = None
    resume_event: asyncio.Event = field(default_factory=asyncio.Event)

    def clear_resume(self) -> None:
        self.resume_event.clear()


def _redis_key(application_id: str) -> str:
    return f"{_REDIS_PREFIX}:{application_id}"


class BrowserSessionRegistry:
    """Manages live browser sessions keyed by application id."""

    def __init__(self) -> None:
        self._sessions: dict[str, BrowserSession] = {}
        self._lock = asyncio.Lock()

    async def register(
        self,
        application_id: str,
        *,
        browser: Browser,
        context: BrowserContext,
        page: Page,
        worker_id: str | None = None,
    ) -> BrowserSession:
        browser_session_id = str(uuid4())
        session = BrowserSession(
            application_id=application_id,
            browser_session_id=browser_session_id,
            browser=browser,
            context=context,
            page=page,
            worker_id=worker_id,
        )
        async with self._lock:
            existing = self._sessions.get(application_id)
            if existing is not None:
                logger.warning(
                    "Replacing existing browser session for application_id=%s",
                    application_id,
                )
                await self._close_session(existing)
            self._sessions[application_id] = session

        await self._persist_metadata(session)
        logger.info(
            "Registered browser session application_id=%s session_id=%s",
            application_id,
            browser_session_id,
        )
        return session

    async def get(self, application_id: str) -> BrowserSession | None:
        return self._sessions.get(application_id)

    async def set_control_mode(
        self,
        application_id: str,
        mode: ControlMode,
    ) -> BrowserSession | None:
        session = self._sessions.get(application_id)
        if session is None:
            return None
        session.control_mode = mode
        await self._persist_metadata(session)
        return session

    async def signal_resume(self, application_id: str) -> bool:
        session = self._sessions.get(application_id)
        if session is None:
            return False
        session.control_mode = ControlMode.AGENT
        session.resume_event.set()
        await self._persist_metadata(session)
        return True

    def iter_sessions(self) -> list[BrowserSession]:
        return list(self._sessions.values())

    async def release(self, application_id: str, *, close_browser: bool = False) -> None:
        async with self._lock:
            session = self._sessions.pop(application_id, None)
        if session is None:
            return
        if close_browser:
            await self._close_session(session)
        await self._delete_metadata(application_id)
        logger.info("Released browser session application_id=%s", application_id)

    async def _close_session(self, session: BrowserSession) -> None:
        try:
            await asyncio.wait_for(session.context.close(), timeout=15.0)
        except asyncio.TimeoutError:
            logger.warning(
                "Context close timed out application_id=%s", session.application_id
            )
        except Exception:
            logger.exception(
                "Context close failed application_id=%s", session.application_id
            )
        try:
            await session.browser.close()
        except Exception:
            logger.exception(
                "Browser close failed application_id=%s", session.application_id
            )

    async def _persist_metadata(self, session: BrowserSession) -> None:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        payload = {
            "applicationId": session.application_id,
            "browserSessionId": session.browser_session_id,
            "controlMode": session.control_mode.value,
            "workerId": session.worker_id,
            "currentUrl": session.page.url if not session.page.is_closed() else None,
        }
        try:
            await r.set(
                _redis_key(session.application_id),
                json.dumps(payload),
                ex=settings.browser_session_ttl_seconds,
            )
        finally:
            await r.aclose()

    async def _delete_metadata(self, application_id: str) -> None:
        r = aioredis.from_url(settings.redis_url, decode_responses=True)
        try:
            await r.delete(_redis_key(application_id))
        finally:
            await r.aclose()


# Process-wide singleton used by workers and WebSocket handlers.
session_registry = BrowserSessionRegistry()
