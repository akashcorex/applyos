"""Shared dependency instances injected via FastAPI's lifespan."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import redis.asyncio as aioredis

from app.config import settings

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    """Mutable container attached to `app.state` during lifespan."""

    redis: aioredis.Redis | None = None
    _is_ready: bool = field(default=False, init=False)

    @property
    def is_ready(self) -> bool:
        return self._is_ready

    async def startup(self) -> None:
        """Initialise shared resources. Redis is optional so the API can boot."""
        client = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
        try:
            await client.ping()
        except Exception:
            await client.aclose()
            logger.warning(
                "Redis unavailable at %s — starting without a broker",
                settings.redis_url,
            )
            self.redis = None
            self._is_ready = False
            return

        self.redis = client
        logger.info("Redis connected at %s", settings.redis_url)
        self._is_ready = True

    async def shutdown(self) -> None:
        """Tear down shared resources."""
        if self.redis:
            await self.redis.aclose()
            logger.info("Redis connection closed")
        self._is_ready = False


# Singleton used by the lifespan and dependency injection
app_state = AppState()
