"""Celery task: detect ATS → map fields → fill → submit → publish result."""

from __future__ import annotations

import asyncio
import logging

from playwright.async_api import Page

from app.ats.detector import get_handler
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
from app.ats.wellfound import WellfoundHandler
from app.events.publisher import publish_apply_result
from app.llm.answer_generator import generate_answers
from app.llm.field_mapper import map_fields_with_llm
from app.models.job_payload import JobPayload
from app.models.result_event import ApplyResultEvent, ApplyStatus
from app.workers.cancellation import is_apply_task_cancelled
from app.workers.celery_app import celery_app
from app.workers.retry_policy import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_SECONDS,
    UnsafeToRetry,
    retry_if_transient,
)

logger = logging.getLogger(__name__)

_MANUAL_ACTION_HINT = (
    "Open the application URL in your browser to complete the required "
    "manual step, then retry this application."
)


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


def _extract_screening_questions(fields, field_mapping: dict[str, str]) -> list[str]:
    """Return textarea labels that look like screening questions."""
    questions: list[str] = []
    for field in fields:
        if field.field_type != "textarea":
            continue
        if field.selector in field_mapping:
            continue
        label = field.label.strip()
        if label and (label.endswith("?") or len(label) > 20):
            questions.append(label)
    return questions


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
        detail = f"{error_detail.rstrip('.')}. {_MANUAL_ACTION_HINT}" if error_detail else _MANUAL_ACTION_HINT
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
    try:
        async with launch_browser() as browser:
            storage_state = await load_session(user_id)
            had_linkedin_at_start = has_linkedin_cookies(storage_state)
            had_wellfound_at_start = has_wellfound_cookies(storage_state)
            context = await create_context(browser, storage_state=storage_state)
            page = await new_stealth_page(context)

            try:
                await _raise_if_apply_task_cancelled(task_id)
                await page.goto(job_url, wait_until="domcontentloaded", timeout=45_000)

                handler = await get_handler(job_url, page)

                # Wellfound often lists jobs that apply on an external ATS.
                if isinstance(handler, WellfoundHandler):
                    external = await handler.resolve_external_apply_url(page, job_url)
                    if external:
                        logger.info(
                            "Wellfound: redirecting to external ATS: %s", external[:120]
                        )
                        await _raise_if_apply_task_cancelled(task_id)
                        await page.goto(
                            external, wait_until="domcontentloaded", timeout=45_000
                        )
                        handler = await get_handler(external, page)

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
                    return await _failure_event(
                        payload,
                        status=status,
                        error_detail=err,
                        ats_type=getattr(handler, "ats_name", None),
                        page=page,
                    )

                if uses_agentic_fill:
                    await _raise_if_apply_task_cancelled(task_id)
                    submit_started = True
                    result = await handler.fill_and_submit(page, payload.cv_data, {})
                else:
                    form_html = await page.evaluate(
                        "() => document.querySelector('form')?.outerHTML?.substring(0, 8000) || ''"
                    )
                    field_mapping = await map_fields_with_llm(
                        fields, payload.cv_data, form_html
                    )

                    questions = _extract_screening_questions(fields, field_mapping)
                    if questions:
                        answers = await generate_answers(
                            questions=questions,
                            cv_data=payload.cv_data,
                            user_profile=payload.user_profile,
                            job_title=payload.job_title or "",
                            company_name=payload.company_name,
                            job_description=payload.job_description or "",
                        )
                        for field in fields:
                            if field.label in answers:
                                field_mapping[field.selector] = answers[field.label]

                    for field in fields:
                        if field.field_type not in ("select", "radio") or not field.required:
                            continue
                        if field.selector in field_mapping:
                            continue
                        if not field.options:
                            continue
                        if field.options == ["Yes", "No"]:
                            label = field.label.lower()
                            default = "No" if "sponsor" in label else "Yes"
                            field_mapping[field.selector] = f"literal:{default}"
                        else:
                            field_mapping[field.selector] = f"literal:{field.options[0]}"

                    await _raise_if_apply_task_cancelled(task_id)
                    submit_started = True
                    result = await handler.fill_and_submit(
                        page, payload.cv_data, field_mapping
                    )

                current_state = await context.storage_state()
                if should_save_session(
                    current_state,
                    had_linkedin_at_start=had_linkedin_at_start,
                    had_wellfound_at_start=had_wellfound_at_start,
                ):
                    await save_session(user_id, context)

                if result.success:
                    return ApplyResultEvent(
                        job_id=payload.job_id,
                        user_id=user_id,
                        status=ApplyStatus.submitted,
                        ats_type=result.ats_type,
                    )

                return await _failure_event(
                    payload,
                    status=_status_from_error(result.error),
                    error_detail=result.error,
                    ats_type=result.ats_type,
                    page=page,
                )

            finally:
                await context.close()
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
            return await _failure_event(
                payload,
                status=ApplyStatus.login_required,
                error_detail=str(exc),
                page=page,
            )
        raise


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
