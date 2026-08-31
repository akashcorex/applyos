"""Celery task: detect ATS → map fields → fill → submit → publish result."""

from __future__ import annotations

import asyncio
import logging

from playwright.async_api import Page

from app.ats.wellfound import WellfoundHandler
from app.browser.artifacts import capture_failure_artifacts
from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.resume_upload import prepare_resume_file
from app.browser.session_manager import (
    has_linkedin_cookies,
    has_wellfound_cookies,
    load_session,
    save_session,
    should_save_session,
)
from app.browser.session_registry import session_registry
from app.streaming.redis_relay import (
    start_worker_stream_relay,
    stop_worker_stream_relay,
)
from app.config import settings
from app.events.publisher import publish_apply_result
from app.models.hitl import HumanInterventionRequired
from app.models.job_payload import JobPayload
from app.models.result_event import ApplyResultEvent, ApplyStatus
from app.services.application_api_client import ApplicationApiClient
from app.workers.application_runner import ApplicationRunner
from app.workers.cancellation import is_apply_task_cancelled
from app.workers.celery_app import celery_app
from app.workers.retry_policy import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_SECONDS,
    UnsafeToRetry,
    retry_if_transient,
)

logger = logging.getLogger(__name__)

_CONTEXT_CLOSE_TIMEOUT_SECONDS = 15.0

_MANUAL_ACTION_HINT = (
    "Open the application URL in your browser to complete the required "
    "manual step, then retry this application."
)


async def _publish_apply_result_safe(event: ApplyResultEvent) -> None:
    try:
        await publish_apply_result(event)
    except Exception:
        logger.exception(
            "Failed to publish apply result for job_id=%s", event.job_id
        )


async def _return_apply_event(event: ApplyResultEvent) -> ApplyResultEvent:
    """Publish the outcome before slow browser teardown so the UI updates promptly."""
    await _publish_apply_result_safe(event)
    return event


async def _close_context(context) -> None:
    try:
        await asyncio.wait_for(
            context.close(), timeout=_CONTEXT_CLOSE_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        logger.warning("Browser context close timed out")
    except Exception:
        logger.exception("Browser context close failed")


class ApplyTaskCancelled(Exception):
    """Raised when an application task has been cancelled between safe steps."""


class _SubmitAttempted(Exception):
    """Internal: form submit may already have been clicked."""

    def __init__(
        self,
        message: str,
        *,
        page_url: str | None = None,
        screenshot_path: str | None = None,
    ) -> None:
        super().__init__(message)
        self.page_url = page_url
        self.screenshot_path = screenshot_path


async def _raise_if_apply_task_cancelled(task_id: str) -> None:
    if await is_apply_task_cancelled(task_id):
        raise ApplyTaskCancelled(f"Application task {task_id} was cancelled")


def _status_from_error(error: str | None) -> ApplyStatus:
    err = (error or "").upper()
    if any(token in err for token in ("CAPTCHA", "TURNSTILE", "CLOUDFLARE", "MANUAL ACTION")):
        return ApplyStatus.captcha_blocked
    if "LOGIN REQUIRED" in err or "WELLFOUND LOGIN" in err:
        return ApplyStatus.login_required
    if "ALREADY APPLIED" in err:
        return ApplyStatus.already_applied
    return ApplyStatus.failed


async def _failure_event(
    payload: JobPayload,
    *,
    status: ApplyStatus,
    error_detail: str | None,
    ats_type: str | None = None,
    page: Page | None = None,
) -> ApplyResultEvent:
    page_url, screenshot_path = await capture_failure_artifacts(page, payload.job_id)
    detail = error_detail
    if status in {ApplyStatus.captcha_blocked, ApplyStatus.login_required}:
        detail = (
            f"{error_detail.rstrip('.')}. {_MANUAL_ACTION_HINT}"
            if error_detail
            else _MANUAL_ACTION_HINT
        )
    return ApplyResultEvent(
        job_id=payload.job_id,
        user_id=payload.user_profile.user_id,
        status=status,
        ats_type=ats_type,
        error_detail=detail,
        page_url=page_url,
        screenshot_path=screenshot_path,
    )


async def _run_apply(payload: JobPayload, task_id: str) -> ApplyResultEvent:
    await _raise_if_apply_task_cancelled(task_id)
    user_id = payload.user_profile.user_id
    job_url = str(payload.job_url)
    page: Page | None = None
    submit_started = False
    application_id = payload.application_id
    api_client = ApplicationApiClient()
    use_hitl = settings.hitl_mode and bool(application_id)

    async with prepare_resume_file(payload.cv_data) as resume_path:
        if resume_path is None:
            logger.error(
                "Apply blocked for job_id=%s: no compiled resume artifact URL",
                payload.job_id,
            )
            return ApplyResultEvent(
                job_id=payload.job_id,
                user_id=user_id,
                status=ApplyStatus.failed,
                error_detail=(
                    "A compiled resume artifact URL is required before applying"
                ),
            )

    await _raise_if_apply_task_cancelled(task_id)

    if use_hitl:
        await api_client.update_session(
            application_id,
            status="starting",
            current_step="Launching browser",
        )
        await api_client.append_event(
            application_id,
            event_type="BROWSER_READY",
            description="Starting browser session",
        )

    browser = None
    context = None
    try:
        headless = True if use_hitl else None
        async with launch_browser(headless=headless) as browser:
            storage_state = await load_session(user_id)
            had_linkedin_at_start = has_linkedin_cookies(storage_state)
            had_wellfound_at_start = has_wellfound_cookies(storage_state)
            context = await create_context(browser, storage_state=storage_state)
            page = await new_stealth_page(context)

            if use_hitl:
                session = await session_registry.register(
                    application_id,
                    browser=browser,
                    context=context,
                    page=page,
                    worker_id=task_id,
                )
                await start_worker_stream_relay(application_id, page)
                await api_client.update_session(
                    application_id,
                    status="running",
                    browser_session_id=session.browser_session_id,
                    control_mode="agent_control",
                    current_url=page.url,
                    current_step="Browser ready",
                    external_task_id=task_id,
                )
            elif application_id:
                await api_client.update_session(
                    application_id,
                    status="running",
                    current_url=page.url,
                    current_step="Browser ready",
                    external_task_id=task_id,
                )

            runner = ApplicationRunner(
                payload,
                task_id=task_id,
                page=page,
                context=context,
                api_client=api_client,
            )

            await _raise_if_apply_task_cancelled(task_id)
            handler = await runner.navigate_to_apply_page(job_url)

            fields = await handler.extract_fields(page)
            uses_agentic_fill = getattr(handler, "uses_agentic_fill", False)

            if not fields and not uses_agentic_fill:
                err = "No application form fields found after opening apply page"
                if isinstance(handler, WellfoundHandler):
                    err = (
                        "Wellfound apply failed — log in via "
                        "scripts/bootstrap_wellfound_session.py or this job may "
                        "use an external ATS we could not resolve"
                    )
                status = (
                    ApplyStatus.login_required
                    if isinstance(handler, WellfoundHandler)
                    else ApplyStatus.failed
                )
                return await _return_apply_event(
                    await _failure_event(
                        payload,
                        status=status,
                        error_detail=err,
                        ats_type=getattr(handler, "ats_name", None),
                        page=page,
                    )
                )

            await _raise_if_apply_task_cancelled(task_id)
            submit_started = True
            result = await runner.fill_and_submit(handler)

            current_state = await context.storage_state()
            if should_save_session(
                current_state,
                had_linkedin_at_start=had_linkedin_at_start,
                had_wellfound_at_start=had_wellfound_at_start,
            ):
                await save_session(user_id, context)

            if result.success:
                if use_hitl:
                    await api_client.update_session(
                        application_id,
                        status="submitted",
                        current_step="Application submitted",
                    )
                    await api_client.append_event(
                        application_id,
                        event_type="APPLICATION_SUBMITTED",
                        description="Application submitted successfully",
                    )
                return await _return_apply_event(
                    ApplyResultEvent(
                        job_id=payload.job_id,
                        user_id=user_id,
                        status=ApplyStatus.submitted,
                        ats_type=result.ats_type,
                    )
                )

            return await _return_apply_event(
                await _failure_event(
                    payload,
                    status=_status_from_error(result.error),
                    error_detail=result.error,
                    ats_type=result.ats_type,
                    page=page,
                )
            )

    except HumanInterventionRequired as exc:
        return await _return_apply_event(
            await _failure_event(
                payload,
                status=_status_from_error(exc.message),
                error_detail=exc.message,
                page=page,
            )
        )
    except ApplyTaskCancelled:
        raise
    except Exception as exc:
        if submit_started:
            page_url, screenshot_path = await capture_failure_artifacts(
                page, payload.job_id
            )
            raise _SubmitAttempted(
                str(exc),
                page_url=page_url,
                screenshot_path=screenshot_path,
            ) from exc
        logger.exception("Apply task failed for job_id=%s", payload.job_id)
        if "login" in str(exc).lower():
            return await _return_apply_event(
                await _failure_event(
                    payload,
                    status=ApplyStatus.login_required,
                    error_detail=str(exc),
                    page=page,
                )
            )
        raise
    finally:
        if use_hitl and application_id:
            await stop_worker_stream_relay(application_id)
            await session_registry.release(application_id)


@celery_app.task(
    bind=True,
    name="apply_agent.apply_job",
    max_retries=DEFAULT_MAX_RETRIES,
    default_retry_delay=DEFAULT_RETRY_DELAY_SECONDS,
)
def apply_job(self, payload_dict: dict) -> dict:
    """Celery entry point for a single job application."""
    payload = JobPayload.model_validate(payload_dict)

    try:
        event = asyncio.run(_run_apply(payload, self.request.id))
    except ApplyTaskCancelled:
        logger.info("Apply task cancelled before submission task_id=%s", self.request.id)
        event = ApplyResultEvent(
            job_id=payload.job_id,
            user_id=payload.user_profile.user_id,
            status=ApplyStatus.cancelled,
            error_detail="Application task cancelled before submission",
        )
    except _SubmitAttempted as exc:
        event = ApplyResultEvent(
            job_id=payload.job_id,
            user_id=payload.user_profile.user_id,
            status=ApplyStatus.failed,
            error_detail=(
                f"Submit may already have been attempted; not retrying. {exc}"
            ),
            page_url=exc.page_url,
            screenshot_path=exc.screenshot_path,
        )
    except Exception as exc:
        try:
            retry_if_transient(self, exc)
        except UnsafeToRetry:
            event = ApplyResultEvent(
                job_id=payload.job_id,
                user_id=payload.user_profile.user_id,
                status=ApplyStatus.failed,
                error_detail=str(exc),
            )
        else:
            raise AssertionError("retry_if_transient must raise")

    asyncio.run(publish_apply_result(event))
    return event.model_dump(mode="json")
