"""Email delivery helpers. Sending is not wired; keep provider config only."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

import httpx

from config import settings

logger = logging.getLogger(__name__)


class EmailDeliveryError(RuntimeError):
    pass


def configured_provider() -> str | None:
    if settings.resend_api_key:
        return "resend"
    if settings.smtp_host and settings.email_from:
        return "smtp"
    return None


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
