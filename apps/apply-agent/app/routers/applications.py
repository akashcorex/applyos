"""WebSocket routes for live browser sessions."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, WebSocket, WebSocketDisconnect

from app.browser.session_registry import session_registry
from app.config import settings
from app.streaming.input_relay import relay_input
from app.streaming.screencast import get_or_start_streamer, stop_streamer

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

    session = await session_registry.get(application_id)
    if session is None:
        await websocket.close(code=4404)
        return

    await websocket.accept()
    streamer = await get_or_start_streamer(application_id)
    if streamer is None:
        await websocket.close(code=4404)
        return

    async def send_frames() -> None:
        try:
            async for frame in streamer.frames():
                await websocket.send_bytes(frame)
        except WebSocketDisconnect:
            pass
        except Exception:
            logger.exception(
                "Screencast stream failed application_id=%s", application_id
            )

    async def receive_input() -> None:
        try:
            while True:
                raw = await websocket.receive_text()
                message = json.loads(raw)
                current = await session_registry.get(application_id)
                if current is None:
                    break
                await relay_input(
                    current.page,
                    message,
                    control_mode=current.control_mode,
                )
        except WebSocketDisconnect:
            pass
        except json.JSONDecodeError:
            logger.warning("Invalid JSON input from browser websocket")
        except Exception:
            logger.exception(
                "Input relay failed application_id=%s", application_id
            )

    send_task = asyncio.create_task(send_frames())
    recv_task = asyncio.create_task(receive_input())

    try:
        await asyncio.wait(
            {send_task, recv_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
    finally:
        send_task.cancel()
        recv_task.cancel()
        await stop_streamer(application_id)
        try:
            await websocket.close()
        except Exception:
            pass
