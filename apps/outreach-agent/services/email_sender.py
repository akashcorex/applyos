"""Opt-in email delivery. Nothing is sent unless the user enabled outreach."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


async def user_email_outreach_enabled(user_id: str) -> bool:
    if not settings.agent_service_token:
        return False
    url = f"{settings.api_url.rstrip('/')}/v1/preferences/internal/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                url,
                headers={"X-Agent-Service-Token": settings.agent_service_token},
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
    except httpx.HTTPError as exc:
        logger.warning("Could not load outreach preferences for %s: %s", user_id, exc)
        return False
    return bool(data.get("emailOutreachEnabled"))


def configured_provider() -> str | None:
    if settings.resend_api_key:
        return "resend"
    if settings.smtp_host and settings.email_from:
        return "smtp"
    return None


async def record_email(
    *,
    user_id: str,
    to_email: str,
    subject: str,
    provider: str,
    status: str,
    application_id: str | None,
    error_detail: str | None = None,
) -> None:
    if not settings.agent_service_token:
        return
    url = f"{settings.api_url.rstrip('/')}/v1/outreach/internal/emails"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                url,
                headers={"X-Agent-Service-Token": settings.agent_service_token},
                json={
                    "userId": user_id,
                    "toAddress": to_email,
                    "subject": subject,
                    "provider": provider,
                    "status": status,
                    "applicationId": application_id,
                    "errorDetail": error_detail,
                },
            )
    except httpx.HTTPError as exc:
        logger.warning("Could not persist outreach email audit row: %s", exc)


async def send_email(*, to_email: str, subject: str, body: str) -> str:
    provider = configured_provider()
    if provider is None:
        raise EmailDeliveryError("No email provider is configured")
    if not settings.email_from:
        raise EmailDeliveryError("EMAIL_FROM is required")

    if provider == "resend":
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.email_from,
                    "to": [to_email],
                    "subject": subject,
                    "text": body,
                },
            )
            if response.status_code >= 400:
                raise EmailDeliveryError(response.text[:300])
        return provider

    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)
    return provider
