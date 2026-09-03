"""WebSocket routes for live browser sessions."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, WebSocket

from app.config import settings
from app.streaming.redis_relay import relay_websocket_session, session_metadata_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/applications", tags=["applications"])

# Simple in-memory token store: token -> application_id (5 min TTL managed by caller)
_browser_tokens: dict[str, str] = {}


def register_browser_token(token: str, application_id: str) -> None:
    _browser_tokens[token] = application_id


def require_agent_service_token(
    x_agent_service_token: Annotated[str | None, Header()] = None,
) -> None:
    if not (
        settings.agent_service_token
        and x_agent_service_token
        and x_agent_service_token == settings.agent_service_token
    ):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.websocket("/{application_id}/browser")
async def browser_websocket(websocket: WebSocket, application_id: str) -> None:
    """Stream screencast frames and relay input for an application session."""
    token = websocket.query_params.get("token")
    if not token or _browser_tokens.get(token) != application_id:
        await websocket.close(code=4401)
        return

    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.redis_url, decode_responses=True)
    try:
        metadata = await r.get(session_metadata_key(application_id))
    finally:
        await r.aclose()

    if not metadata:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    try:
        await relay_websocket_session(websocket, application_id)
    except Exception:
        logger.exception(
            "Browser websocket relay failed application_id=%s", application_id
        )
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
