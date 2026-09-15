"""Application runner with persistent browser sessions and HITL pause/resume."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from playwright.async_api import BrowserContext, Page

from app.ats.detector import get_handler
from app.ats.wellfound import WellfoundHandler
from app.browser.blocker_detector import detect_blocker, verify_blocker_cleared
from app.browser.session_registry import ControlMode, session_registry
from app.config import settings
from app.llm.answer_generator import generate_answers
from app.llm.field_mapper import map_fields_with_llm
from app.models.hitl import HumanInterventionRequired, PENDING_SUBMIT_APPROVAL
from app.models.job_payload import JobPayload
from app.services.application_api_client import ApplicationApiClient
from app.services.resume_signal import wait_for_resume
from app.streaming.redis_relay import publish_control_mode

if TYPE_CHECKING:
    from app.ats.base import FillResult

logger = logging.getLogger(__name__)

_CAPTCHA_TOKENS = ("CAPTCHA", "TURNSTILE", "CLOUDFLARE", "MANUAL ACTION")
_LOGIN_TOKENS = ("LOGIN REQUIRED", "WELLFOUND LOGIN")


def _error_indicates_human_block(error: str | None) -> tuple[str, str] | None:
    if not error:
        return None
    upper = error.upper()
    if any(token in upper for token in _CAPTCHA_TOKENS):
        if "CLOUDFLARE" in upper:
            return ("CLOUDFLARE", error)
        if "TURNSTILE" in upper:
            return ("RECAPTCHA", error)
        return ("CAPTCHA", error)
    if any(token in upper for token in _LOGIN_TOKENS):
        return ("LOGIN", error)
    return None


def _extract_screening_questions(fields, field_mapping: dict[str, str]) -> list[str]:
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


class ApplicationRunner:
    """Orchestrates apply steps with optional human-in-the-loop pauses."""

    def __init__(
        self,
        payload: JobPayload,
        *,
        task_id: str,
        page: Page,
        context: BrowserContext,
        api_client: ApplicationApiClient | None = None,
    ) -> None:
        self.payload = payload
        self.task_id = task_id
        self.page = page
        self.context = context
        self.api = api_client or ApplicationApiClient()
        self.application_id = payload.application_id

    async def _sync(
        self,
        *,
        status: str | None = None,
        current_step: str | None = None,
        control_mode: str | None = None,
        human_intervention_required: bool | None = None,
        intervention_reason: str | None = None,
        browser_session_id: str | None = None,
    ) -> None:
        if not self.application_id:
            return
        await self.api.update_session(
            self.application_id,
            status=status,
            browser_session_id=browser_session_id,
            current_url=self.page.url,
            current_step=current_step,
            control_mode=control_mode,
            human_intervention_required=human_intervention_required,
            intervention_reason=intervention_reason,
        )

    async def _log_event(
        self,
        event_type: str,
        description: str,
        metadata: dict | None = None,
    ) -> None:
        if not self.application_id:
            return
        await self.api.append_event(
            self.application_id,
            event_type=event_type,
            description=description,
            metadata=metadata,
        )

    async def request_human_intervention(
        self,
        intervention_type: str,
        message: str,
    ) -> None:
        """Pause automation, keep browser alive, and wait for user resume."""
        if not self.application_id or not settings.hitl_mode:
            raise HumanInterventionRequired(intervention_type, message)

        logger.info(
            "Human intervention required application_id=%s type=%s",
            self.application_id,
            intervention_type,
        )

        await self.api.create_intervention(
            self.application_id,
            intervention_type=intervention_type,
            message=message,
        )
        await self._log_event(
            "HUMAN_INTERVENTION",
            message,
            {"type": intervention_type},
        )
        await session_registry.set_control_mode(
            self.application_id, ControlMode.HUMAN
        )
        # Keep WorkerStreamRelay in sync — otherwise UI shows human control
        # while relay_input still drops clicks/keys as agent_control.
        await publish_control_mode(self.application_id, ControlMode.HUMAN)
        await self._sync(
            status="waiting_for_human",
            control_mode="human_control",
            human_intervention_required=True,
            intervention_reason=message,
            current_step="Waiting for human action",
        )

        resumed = await wait_for_resume(self.application_id)
        if not resumed:
            raise HumanInterventionRequired(
                intervention_type,
                f"Human intervention timed out: {message}",
            )

        if intervention_type != "SUBMIT_APPROVAL":
            if not await verify_blocker_cleared(self.page, expected_type=intervention_type):
                raise HumanInterventionRequired(
                    intervention_type,
                    f"Blocker still present after human intervention: {message}",
                )

        await session_registry.signal_resume(self.application_id)
        await publish_control_mode(self.application_id, ControlMode.AGENT)
        await self._sync(
            status="resuming",
            control_mode="agent_control",
            human_intervention_required=False,
            intervention_reason=None,
            current_step="Resuming after human intervention",
        )
        await self._log_event("AGENT_RESUMED", "Agent resumed after human intervention")

    async def check_and_pause_for_blocker(self) -> None:
        """Proactively detect page blockers and pause for human help."""
        blocker = await detect_blocker(self.page)
        if blocker is None:
            return
        await self._log_event(
            "BLOCKER_DETECTED",
            blocker.message,
            {"type": blocker.type},
        )
        await self.request_human_intervention(blocker.type, blocker.message)

    async def navigate_to_apply_page(self, job_url: str) -> object:
        await self._sync(status="running", current_step="Opening application page")
        await self._log_event("PAGE_OPENED", f"Opened {job_url}", {"url": job_url})
        await self.page.goto(job_url, wait_until="domcontentloaded", timeout=45_000)

        handler = await get_handler(job_url, self.page)
        if isinstance(handler, WellfoundHandler):
            external = await handler.resolve_external_apply_url(self.page, job_url)
            if external:
                logger.info("Wellfound: redirecting to external ATS: %s", external[:120])
                await self._log_event(
                    "NAVIGATION",
                    "Redirected to external ATS",
                    {"url": external},
                )
                await self.page.goto(
                    external, wait_until="domcontentloaded", timeout=45_000
                )
                handler = await get_handler(external, self.page)

        await self._sync(current_step="Application page loaded")
        await self.check_and_pause_for_blocker()
        return handler

    async def fill_and_submit(self, handler) -> FillResult:
        """Run fill/submit, pausing for human intervention when blockers occur."""
        while True:
            await self.check_and_pause_for_blocker()
            result = await self._attempt_fill(handler)
            if result.error == PENDING_SUBMIT_APPROVAL:
                await self._log_event(
                    "FIELD_FILLED",
                    "Application form filled — waiting for your approval to submit",
                    {"fields_filled": result.fields_filled},
                )
                await self.request_human_intervention(
                    "SUBMIT_APPROVAL",
                    "Review the filled application in the live browser, then approve submission.",
                )
                await self._sync(current_step="Submitting application")
                result = await self._submit_only(handler, result.fields_filled)
            if result.success:
                await self._log_event(
                    "APPLICATION_SUBMITTED",
                    "Application form submitted",
                    {"fields_filled": result.fields_filled},
                )
                return result

            blocker = _error_indicates_human_block(result.error)
            if blocker and settings.hitl_mode and self.application_id:
                intervention_type, message = blocker
                await self.request_human_intervention(intervention_type, message)
                handler = await get_handler(self.page.url, self.page)
                continue

            if result.error:
                await self._log_event(
                    "APPLICATION_FAILED",
                    result.error,
                    {"fields_filled": result.fields_filled},
                )
            return result

    async def _attempt_fill(self, handler) -> FillResult:
        fields = await handler.extract_fields(self.page)
        uses_agentic_fill = getattr(handler, "uses_agentic_fill", False)

        form_html = await self.page.evaluate(
            "() => document.querySelector('form')?.outerHTML?.substring(0, 8000) || ''"
        )
        field_mapping = await map_fields_with_llm(
            fields, self.payload.cv_data, form_html
        )

        questions = _extract_screening_questions(fields, field_mapping)
        if questions:
            answers = await generate_answers(
                questions=questions,
                cv_data=self.payload.cv_data,
                user_profile=self.payload.user_profile,
                job_title=self.payload.job_title or "",
                company_name=self.payload.company_name,
                job_description=self.payload.job_description or "",
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

        if uses_agentic_fill:
            await self._sync(current_step="Structured + agentic form fill")
            return await handler.fill_and_submit(
                self.page,
                self.payload.cv_data,
                field_mapping,
            )

        await self._sync(current_step="Filling application form")
        auto_submit = self.payload.auto_submit
        fill_kwargs: dict = {}
        if hasattr(handler, "fill_and_submit"):
            import inspect

            params = inspect.signature(handler.fill_and_submit).parameters
            if "auto_submit" in params:
                fill_kwargs["auto_submit"] = auto_submit
        return await handler.fill_and_submit(
            self.page, self.payload.cv_data, field_mapping, **fill_kwargs
        )

    async def _submit_only(self, handler, fields_filled: int) -> FillResult:
        if hasattr(handler, "submit_form"):
            return await handler.submit_form(self.page, fields_filled=fields_filled)
        return FillResult(
            success=False,
            ats_type=getattr(handler, "ats_name", "unknown"),
            fields_filled=fields_filled,
            error="Submit approval is not supported for this application site yet",
        )
