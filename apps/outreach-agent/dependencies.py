"""Shared application state for outreach-agent."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from services.message_generator import OutreachMessageGenerator

logger = logging.getLogger(__name__)


@dataclass
class AppState:
    generator: OutreachMessageGenerator | None = None

    async def startup(self) -> None:
        self.generator = OutreachMessageGenerator()
        logger.info("outreach-agent started")

    async def shutdown(self) -> None:
        logger.info("outreach-agent stopped")


app_state = AppState()
