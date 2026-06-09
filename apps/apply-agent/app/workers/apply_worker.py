"""Celery task: detect ATS → map fields → fill → submit → publish result."""

from __future__ import annotations

import asyncio
import logging

from app.ats.detector import get_handler
from app.browser.captcha import detect_captcha
from app.browser.engine import create_context, launch_browser, new_stealth_page
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

    async with launch_browser(headless=True) as browser:
        storage_state = await load_session(user_id)
        context = await create_context(browser, storage_state=storage_state)
        page = await new_stealth_page(context)

        try:
            await page.goto(job_url, wait_until="domcontentloaded", timeout=45_000)

            if await detect_captcha(page):
                return ApplyResultEvent(
                    job_id=payload.job_id,
                    user_id=user_id,
                    status=ApplyStatus.captcha_blocked,
                    error_detail="CAPTCHA detected on application page",
                )

            handler = await get_handler(job_url, page)
            fields = await handler.extract_fields(page)

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

            result = await handler.fill_and_submit(page, payload.cv_data, field_mapping)

            await save_session(user_id, context)

            if result.success:
                return ApplyResultEvent(
                    job_id=payload.job_id,
                    user_id=user_id,
                    status=ApplyStatus.submitted,
                    ats_type=result.ats_type,
                )

            return ApplyResultEvent(
                job_id=payload.job_id,
                user_id=user_id,
                status=ApplyStatus.failed,
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
