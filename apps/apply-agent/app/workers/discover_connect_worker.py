"""Celery task: discover company employees on LinkedIn and send blank connects."""

from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.human_delay import random_pause
from app.browser.session_manager import (
    has_linkedin_cookies,
    load_session,
    save_session,
    warm_up_linkedin_feed,
)
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

_STOP_WORDS = frozenset(
    {
        "and",
        "the",
        "for",
        "with",
        "senior",
        "junior",
        "lead",
        "staff",
        "intern",
        "associate",
        "principal",
        "head",
        "of",
        "at",
        "in",
        "a",
        "an",
    }
)
_RELEVANCE_HINTS = frozenset(
    {
        "engineer",
        "engineering",
        "developer",
        "recruit",
        "recruiting",
        "recruiter",
        "talent",
        "people",
        "hr",
        "hiring",
        "manager",
        "director",
        "founder",
        "ceo",
        "cto",
    }
)


def _api_status(status: ConnectStatus) -> str:
    if status == ConnectStatus.sent:
        return "sent"
    if status == ConnectStatus.already_connected:
        return "already_connected"
    if status == ConnectStatus.rate_limited:
        return "skipped_rate_limit"
    return "failed"


def _title_keywords(job_title: str | None) -> set[str]:
    if not job_title:
        return set()
    words = re.findall(r"[a-zA-Z]+", job_title.lower())
    keywords = {w for w in words if len(w) > 3 and w not in _STOP_WORDS}
    keywords.update(w for w in words if w in _RELEVANCE_HINTS)
    return keywords


def _relevance_score(employee, keywords: set[str]) -> int:
    title = (employee.title or "").lower()
    if not title or not keywords:
        return 0
    return sum(1 for keyword in keywords if keyword in title)


def _filter_relevant_employees(
    employees: list,
    job_title: str | None,
    limit: int,
) -> list:
    """Rank employees by role relevance; avoid dropping candidates when few are found."""
    if not employees:
        return []

    keywords = _title_keywords(job_title)
    if not keywords:
        return employees[:limit]

    # When discovery returns few people, rank by relevance but keep up to `limit`
    # instead of hard-filtering to a single keyword match.
    if len(employees) <= limit:
        ranked = sorted(
            employees,
            key=lambda employee: _relevance_score(employee, keywords),
            reverse=True,
        )
        return ranked[:limit]

    relevant = [
        employee
        for employee in employees
        if employee.title
        and any(keyword in employee.title.lower() for keyword in keywords)
    ]
    chosen = relevant if relevant else employees
    ranked = sorted(
        chosen,
        key=lambda employee: _relevance_score(employee, keywords),
        reverse=True,
    )
    return ranked[:limit]


async def _publish_session_error(
    user_id: str,
    job_id: str,
    detail: str,
) -> None:
    event = ConnectResultEvent(
        contact_id="session",
        user_id=user_id,
        job_id=job_id,
        action="connect",
        status=ConnectStatus.login_required,
        error_detail=detail,
    )
    await publish_connect_result(event)


async def _connect_blank(
    user_id: str,
    contact_id: str,
    profile_url: str,
    page,
    *,
    job_id: str,
) -> ConnectResultEvent:
    actions = await load_profile(page, profile_url)

    if actions.is_already_connected:
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            job_id=job_id,
            action="connect",
            status=ConnectStatus.already_connected,
        )

    if not await check_connect_limit(user_id):
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            job_id=job_id,
            action="connect",
            status=ConnectStatus.rate_limited,
        )

    if not actions.can_connect:
        return ConnectResultEvent(
            contact_id=contact_id,
            user_id=user_id,
            job_id=job_id,
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
            job_id=job_id,
            action="connect",
            status=ConnectStatus.sent,
        )

    return ConnectResultEvent(
        contact_id=contact_id,
        user_id=user_id,
        job_id=job_id,
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
    if storage_state is None or not has_linkedin_cookies(storage_state):
        detail = "LinkedIn browser session missing — run bootstrap_linkedin_session.py"
        logger.error("No LinkedIn session for user_id=%s — login_required", user_id)
        await _publish_session_error(user_id, payload.job_id, detail)
        return []

    api_rows: list[dict[str, Any]] = []
    events: list[ConnectResultEvent] = []

    async with launch_browser(headless=True, user_id=user_id) as browser:
        context = await create_context(browser, storage_state=storage_state)
        page = await new_stealth_page(context)

        try:
            await warm_up_linkedin_feed(page)

            try:
                employees = await discover_company_employees(
                    page,
                    payload.company_name,
                    limit=limit * 2,
                )
            except CompanyPeopleError as exc:
                logger.error(
                    "Company people discovery failed code=%s: %s",
                    exc.code,
                    exc,
                )
                if exc.code == "login_required":
                    await _publish_session_error(
                        user_id,
                        payload.job_id,
                        str(exc),
                    )
                return []

            discovered_count = len(employees)
            employees = _filter_relevant_employees(employees, payload.job_title, limit)
            logger.info(
                "Selected %d/%d employees for connect (limit=%d)",
                len(employees),
                discovered_count,
                limit,
            )
            if not employees:
                logger.warning(
                    "No employees discovered for company=%s job_id=%s",
                    payload.company_name,
                    payload.job_id,
                )
                return []

            for index, employee in enumerate(employees):
                contact_id = str(uuid.uuid4())
                event = await _connect_blank(
                    user_id,
                    contact_id,
                    employee.profile_url,
                    page,
                    job_id=payload.job_id,
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

                if index < len(employees) - 1:
                    await random_pause(60, 120)
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
