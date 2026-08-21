"""Retry only transient failures that cannot have submitted an application."""

from __future__ import annotations

from typing import Any

# Network/process failures that happen before a submit click are safe to retry.
RETRIABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    OSError,
)

DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY_SECONDS = 60

# Completed worker statuses that must never be retried by Celery.
UNSAFE_TO_RETRY_STATUSES = frozenset(
    {
        "submitted",
        "already_applied",
        "captcha_blocked",
        "login_required",
    }
)


class UnsafeToRetry(Exception):
    """Raised when retrying could double-submit or fight a site protection."""


def is_transient(exc: Exception) -> bool:
    return isinstance(exc, RETRIABLE_EXCEPTIONS)


def retry_if_transient(
    task: Any,
    exc: Exception,
    *,
    submit_attempted: bool = False,
) -> None:
    """Retry the current Celery task only for safe, pre-submit failures."""
    if submit_attempted or not is_transient(exc):
        raise UnsafeToRetry(str(exc)) from exc
    raise task.retry(exc=exc, countdown=DEFAULT_RETRY_DELAY_SECONDS)
