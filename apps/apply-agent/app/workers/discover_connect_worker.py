"""Celery task: discover company employees on LinkedIn and send blank connects."""

from __future__ import annotations

import asyncio
import logging
import uuid
from datetime import UTC, datetime
from typing import Any

from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.session_manager import load_session, save_session
from app.client import report_linkedin_connects
from app.config import settings
from app.events.publisher import publish_connect_result
from app.linkedin.company_people import CompanyPeopleError, discover_company_employees
from app.linkedin.connect import send_connection_request
from app.linkedin.profile_loader import load_profile
from app.linkedin.rate_limiter import check_connect_limit, increment_connect
from app.models.discover_connect_payload import DiscoverConnectPayload
from app.models.result_event import ConnectResultEvent, ConnectStatus
from app.workers.celery_app import celery_app
from app.workers.retry_policy import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_SECONDS,
    retry_if_transient,
)

logger = logging.getLogger(__name__)


def _api_status(status: ConnectStatus) -> str:
    if status == ConnectStatus.sent:
        return "sent"
    if status == ConnectStatus.already_connected:
        return "already_connected"
    if status == ConnectStatus.rate_limited:
        return "skipped_rate_limit"
    return "failed"


async def _connect_blank(
    user_id: str,
    contact_id: str,
    profile_url: str,
    page,
) -> ConnectResultEvent:
    actions = await load_profile(page, profile_url)

    if actions.is_already_connected:
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.already_connected,
        )

    if not await check_connect_limit(user_id):
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.rate_limited,
        )

    if not actions.can_connect:
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.profile_not_found,
            error_detail="Connect button not available",
        )

    ok = await send_connection_request(page, note=None)
    if ok:
        await increment_connect(user_id)
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.sent,
        )

    return ConnectResultEvent(
        contact_id=contact_id,
        user_id=user_id,
        action="connect",
        status=ConnectStatus.failed,
        error_detail="Connection request failed",
    )


async def _run_discover_and_connect(payload: DiscoverConnectPayload) -> list[dict[str, Any]]:
    user_id = payload.user_id
    limit = payload.max_connects or settings.post_apply_connect_limit
    if not settings.post_apply_linkedin_connect_enabled:
        logger.info("Post-apply LinkedIn connect disabled; skipping job_id=%s", payload.job_id)
        return []

    storage_state = await load_session(user_id)
    if storage_state is None:
        logger.error("No LinkedIn session for user_id=%s — login_required", user_id)
        return []

    api_rows: list[dict[str, Any]] = []
    events: list[ConnectResultEvent] = []

    async with launch_browser(headless=True) as browser:
        context = await create_context(browser, storage_state=storage_state)
        page = await new_stealth_page(context)

        try:
            try:
                employees = await discover_company_employees(
                    page,
                    payload.company_name,
                    limit=limit,
                )
            except CompanyPeopleError as exc:
                logger.error(
                    "Company people discovery failed code=%s: %s",
                    exc.code,
                    exc,
                )
                return []

            for employee in employees:
                contact_id = str(uuid.uuid4())
                event = await _connect_blank(
                    user_id,
                    contact_id,
                    employee.profile_url,
                    page,
                )
                events.append(event)
                await publish_connect_result(event)

                sent_at = (
                    datetime.now(UTC).isoformat()
                    if event.status == ConnectStatus.sent
                    else None
                )
                api_rows.append(
                    {
                        "userId": user_id,
                        "jobId": payload.job_id,
                        "companyName": payload.company_name,
                        "profileUrl": employee.profile_url,
                        "profileName": employee.name,
                        "headline": employee.title,
                        "status": _api_status(event.status),
                        "errorDetail": event.error_detail,
                        "sentAt": sent_at,
                    }
                )

                if event.status == ConnectStatus.rate_limited:
                    logger.warning("Hit daily connect limit; stopping early")
                    break
        finally:
            await save_session(user_id, context)
            await context.close()

    await report_linkedin_connects(api_rows)
    return [e.model_dump(mode="json") for e in events]


@celery_app.task(
    bind=True,
    name="apply_agent.discover_and_connect",
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
)
def discover_and_connect(self, payload_dict: dict) -> list[dict]:
    """Celery entry: company people search + blank LinkedIn connects."""
    payload = DiscoverConnectPayload.model_validate(payload_dict)

    try:
        return asyncio.run(_run_discover_and_connect(payload))
    except Exception as exc:
        retry_if_transient(self, exc)
        raise
