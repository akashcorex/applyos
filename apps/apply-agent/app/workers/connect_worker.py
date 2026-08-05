"""Celery task: LinkedIn connect/follow with rate limiting."""

from __future__ import annotations

import asyncio
import logging

from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.session_manager import (
    has_linkedin_cookies,
    load_session,
    save_session,
    warm_up_linkedin_feed,
)
from app.events.publisher import publish_connect_result
from app.linkedin.connect import send_connection_request
from app.linkedin.follow import follow_profile
from app.linkedin.profile_loader import load_profile
from app.linkedin.rate_limiter import (
    check_connect_limit,
    check_follow_limit,
    increment_connect,
    increment_follow,
)
from app.models.contact_payload import ContactPayload, ContactTarget
from app.models.result_event import ConnectResultEvent, ConnectStatus
from app.workers.celery_app import celery_app
from app.workers.retry_policy import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_SECONDS,
    retry_if_transient,
)

logger = logging.getLogger(__name__)


def _build_note(contact: ContactTarget) -> str | None:
    """Build a connection note, or ``None`` for a blank invite."""
    if not contact.include_note:
        return None
    if contact.note_context:
        return contact.note_context
    parts = [f"Hi {contact.name.split()[0]},"]
    if contact.company:
        parts.append(f"I noticed your work at {contact.company} and would love to connect.")
    else:
        parts.append("I'd love to connect and learn more about your work.")
    return " ".join(parts)


async def _process_contact(
    user_id: str,
    contact: ContactTarget,
    page,
) -> ConnectResultEvent:
    actions = await load_profile(page, str(contact.profile_url))

    if actions.is_already_connected:
        return ConnectResultEvent(
            contact_id=contact.contact_id,
            user_id=user_id,
            action=contact.action,
            status=ConnectStatus.already_connected,
        )

    if contact.action == "follow":
        if not await check_follow_limit(user_id):
            return ConnectResultEvent(
                contact_id=contact.contact_id,
                user_id=user_id,
                action="follow",
                status=ConnectStatus.rate_limited,
            )
        if not actions.can_follow:
            return ConnectResultEvent(
                contact_id=contact.contact_id,
                user_id=user_id,
                action="follow",
                status=ConnectStatus.failed,
                error_detail="Follow button not available",
            )
        ok = await follow_profile(page)
        if ok:
            await increment_follow(user_id)
            return ConnectResultEvent(
                contact_id=contact.contact_id,
                user_id=user_id,
                action="follow",
                status=ConnectStatus.sent,
            )
        return ConnectResultEvent(
            contact_id=contact.contact_id,
            user_id=user_id,
            action="follow",
            status=ConnectStatus.failed,
            error_detail="Follow action failed",
        )

    # Default: connect
    if not await check_connect_limit(user_id):
        return ConnectResultEvent(
            contact_id=contact.contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.rate_limited,
        )

    if not actions.can_connect:
        if actions.can_follow:
            return await _process_contact(
                user_id,
                contact.model_copy(update={"action": "follow"}),
                page,
            )
        return ConnectResultEvent(
            contact_id=contact.contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.profile_not_found,
            error_detail="Connect button not available",
        )

    note = _build_note(contact)
    ok = await send_connection_request(page, note=note)
    if ok:
        await increment_connect(user_id)
        return ConnectResultEvent(
            contact_id=contact.contact_id,
            user_id=user_id,
            action="connect",
            status=ConnectStatus.sent,
        )

    return ConnectResultEvent(
        contact_id=contact.contact_id,
        user_id=user_id,
        action="connect",
        status=ConnectStatus.failed,
        error_detail="Connection request failed",
    )


async def _run_connect(payload: ContactPayload) -> list[ConnectResultEvent]:
    user_id = payload.user_id
    events: list[ConnectResultEvent] = []

    storage_state = await load_session(user_id)
    if storage_state is None or not has_linkedin_cookies(storage_state):
        logger.error("No LinkedIn session for user_id=%s — login_required", user_id)
        return [
            ConnectResultEvent(
                contact_id="session",
                user_id=user_id,
                action="connect",
                status=ConnectStatus.login_required,
                error_detail="LinkedIn browser session missing — run bootstrap_linkedin_session.py",
            )
        ]

    async with launch_browser(headless=True) as browser:
        context = await create_context(browser, storage_state=storage_state)
        page = await new_stealth_page(context)

        try:
            await warm_up_linkedin_feed(page)
            for contact in payload.contacts:
                event = await _process_contact(user_id, contact, page)
                events.append(event)
                await publish_connect_result(event)
        finally:
            await save_session(user_id, context)
            await context.close()

    return events


@celery_app.task(
    bind=True,
    name="apply_agent.connect_contacts",
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
)
def connect_contacts(self, payload_dict: dict) -> list[dict]:
    """Celery entry point for LinkedIn connect/follow batch."""
    payload = ContactPayload.model_validate(payload_dict)

    try:
        events = asyncio.run(_run_connect(payload))
    except Exception as exc:
        retry_if_transient(self, exc)

    return [e.model_dump(mode="json") for e in events]
