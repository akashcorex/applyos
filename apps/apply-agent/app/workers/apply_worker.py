"""Celery task: detect ATS → map fields → fill → submit → publish result."""

from __future__ import annotations

import asyncio
import logging

from app.ats.detector import get_handler
from app.browser.engine import create_context, launch_browser, new_stealth_page
from app.browser.resume_upload import prepare_resume_file
from app.browser.session_manager import load_session, save_session
from app.events.publisher import publish_apply_result
from app.llm.answer_generator import generate_answers
from app.llm.field_mapper import map_fields_with_llm
from app.models.job_payload import JobPayload
from app.models.result_event import ApplyResultEvent, ApplyStatus
from app.workers.celery_app import celery_app
from app.workers.retry_policy import (
    DEFAULT_MAX_RETRIES,
    DEFAULT_RETRY_DELAY_SECONDS,
    retry_if_transient,
)

logger = logging.getLogger(__name__)


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


async def _run_apply(payload: JobPayload) -> ApplyResultEvent:
    user_id = payload.user_profile.user_id
    job_url = str(payload.job_url)

    async with prepare_resume_file(payload.cv_data) as resume_path:
        if resume_path is None:
            logger.error(
                "Apply blocked for job_id=%s: no resume_url and no DEFAULT_RESUME_PATH",
                payload.job_id,
            )
            return ApplyResultEvent(
                job_id=payload.job_id,
                user_id=user_id,
                status=ApplyStatus.failed,
                error_detail=(
                    "Resume required: set cv_data.resume_url or DEFAULT_RESUME_PATH "
                    "before applying"
                ),
            )

    async with launch_browser(headless=True) as browser:
        storage_state = await load_session(user_id)
        context = await create_context(browser, storage_state=storage_state)
        page = await new_stealth_page(context)

        try:
            await page.goto(job_url, wait_until="domcontentloaded", timeout=45_000)

            handler = await get_handler(job_url, page)
            fields = await handler.extract_fields(page)

            if not fields:
                return ApplyResultEvent(
                    job_id=payload.job_id,
                    user_id=user_id,
                    status=ApplyStatus.failed,
                    ats_type=getattr(handler, "ats_name", None),
                    error_detail="No application form fields found after opening apply page",
                )

            form_html = await page.evaluate(
                "() => document.querySelector('form')?.outerHTML?.substring(0, 8000) || ''"
            )
            field_mapping = await map_fields_with_llm(fields, payload.cv_data, form_html)

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

            # Ensure required selects get a mapped answer when LLM skipped them.
            for field in fields:
                if field.field_type != "select" or not field.required:
                    continue
                if field.selector in field_mapping:
                    continue
                if field.options:
                    field_mapping[field.selector] = f"literal:{field.options[0]}"

            result = await handler.fill_and_submit(page, payload.cv_data, field_mapping)

            await save_session(user_id, context)

            if result.success:
                return ApplyResultEvent(
                    job_id=payload.job_id,
                    user_id=user_id,
                    status=ApplyStatus.submitted,
                    ats_type=result.ats_type,
                )

            status = ApplyStatus.failed
            if result.error and "CAPTCHA" in result.error.upper():
                status = ApplyStatus.captcha_blocked

            return ApplyResultEvent(
                job_id=payload.job_id,
                user_id=user_id,
                status=status,
                ats_type=result.ats_type,
                error_detail=result.error,
            )

        except Exception as exc:
            logger.exception("Apply task failed for job_id=%s", payload.job_id)
            if "login" in str(exc).lower():
                return ApplyResultEvent(
                    job_id=payload.job_id,
                    user_id=user_id,
                    status=ApplyStatus.login_required,
                    error_detail=str(exc),
                )
            raise

        finally:
            await context.close()


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
        event = asyncio.run(_run_apply(payload))
    except Exception as exc:
        retry_if_transient(self, exc)

    asyncio.run(publish_apply_result(event))
    return event.model_dump(mode="json")
