"""Shared retry configuration for Celery tasks."""

from __future__ import annotations

from celery import Task

# Transient failures worth retrying (network, page load, rate limits)
RETRIABLE_EXCEPTIONS = (
    ConnectionError,
    TimeoutError,
    OSError,
)

DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY_SECONDS = 60


def retry_if_transient(task: Task, exc: Exception) -> None:
    """Retry the current Celery task when *exc* looks transient."""
    if isinstance(exc, RETRIABLE_EXCEPTIONS):
        raise task.retry(exc=exc, countdown=DEFAULT_RETRY_DELAY_SECONDS)
    raise exc
