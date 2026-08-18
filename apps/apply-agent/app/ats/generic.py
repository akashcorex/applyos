"""Generic ATS handler — bounded observe-act loop for unknown apply UIs."""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.resume_upload import require_resume_upload
from app.llm.page_actor import (
    MAX_AGENT_STEPS,
    SNAPSHOT_JS,
    PageAction,
    PageElement,
    choose_next_action,
)
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class GenericHandler(ATSHandler):
    ats_name = "generic"
    uses_agentic_fill = True

    async def detect(self, page: Page) -> bool:
        """Always returns True — this is the catch-all fallback."""
        return True

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Best-effort field list; the agentic loop does not require it."""
        fields: list[FormField] = []
        inputs = await page.query_selector_all(
            "form input:not([type='hidden']), form textarea, form select, "
            "input:not([type='hidden']), textarea, select"
        )
        for elem in inputs:
            tag = await elem.evaluate("el => el.tagName.toLowerCase()")
            elem_id = await elem.get_attribute("id") or ""
            elem_name = await elem.get_attribute("name") or ""
            placeholder = await elem.get_attribute("placeholder") or ""
            elem_type = await elem.get_attribute("type") or "text"
            selector = f"#{elem_id}" if elem_id else f"[name='{elem_name}']" if elem_name else ""
            if not selector:
                continue
            if tag == "select":
                options = await elem.query_selector_all("option")
                opt_texts = [(await option.inner_text()).strip() for option in options]
                fields.append(
                    FormField(
                        selector=selector,
                        label=placeholder or elem_name or elem_id,
                        field_type="select",
                        options=opt_texts,
                    )
                )
            elif tag == "textarea":
                fields.append(
                    FormField(
                        selector=selector,
                        label=placeholder or elem_name or elem_id,
                        field_type="textarea",
                    )
                )
            elif elem_type == "file":
                fields.append(
                    FormField(
                        selector=selector,
                        label=elem_name or "file_upload",
                        field_type="file",
                    )
                )
            elif elem_type == "checkbox":
                fields.append(
                    FormField(
                        selector=selector,
                        label=elem_name or elem_id,
                        field_type="checkbox",
                    )
                )
            else:
                fields.append(
                    FormField(
                        selector=selector,
                        label=placeholder or elem_name or elem_id,
                        field_type="text",
                    )
                )
        logger.info("Generic: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        history: list[str] = []

        try:
            for step in range(MAX_AGENT_STEPS):
                body_text = (await page.inner_text("body"))[:2000]
                lowered = body_text.lower()
                if any(
                    token in lowered
                    for token in (
                        "thank you",
                        "application submitted",
                        "we've received",
                        "we have received",
                        "successfully applied",
                    )
                ):
                    return FillResult(
                        success=True,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                    )
                if any(
                    token in lowered
                    for token in ("captcha", "verify you are human", "cloudflare")
                ):
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error="CAPTCHA blocked generic apply",
                    )
                if any(
                    token in lowered
                    for token in ("sign in", "log in", "login required")
                ) and "password" in lowered:
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error="LOGIN REQUIRED on generic apply page",
                    )

                raw_elements = await page.evaluate(SNAPSHOT_JS)
                elements = [PageElement.model_validate(item) for item in raw_elements]
                action = await choose_next_action(
                    url=page.url,
                    visible_text=body_text,
                    elements=elements,
                    cv_data=cv_data,
                    history=history,
                )
                history.append(f"{action.action}:{action.element_id or ''}:{action.reason}")
                logger.info(
                    "Generic step %s/%s → %s (%s)",
                    step + 1,
                    MAX_AGENT_STEPS,
                    action.action,
                    action.reason,
                )

                if action.action == "done":
                    return FillResult(
                        success=True,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                    )
                if action.action == "give_up":
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=action.reason or "generic apply gave up",
                    )

                delta = await _execute_action(page, cv_data, action)
                filled += delta
                await random_pause(0.4, 1.0)

            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error="generic apply exhausted step budget",
            )
        except Exception as exc:
            logger.error("Generic agentic fill failed: %s", exc)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(exc),
            )


def _selector(action: PageAction) -> str | None:
    if not action.element_id:
        return None
    return f'[data-agent-id="{action.element_id}"]'


async def _execute_action(page: Page, cv_data: CVData, action: PageAction) -> int:
    selector = _selector(action)
    if action.action == "wait":
        await random_pause(1.0, 2.0)
        return 0

    if action.action == "upload":
        ok, error, delta = await require_resume_upload(page, cv_data, "generic")
        if not ok:
            raise RuntimeError(error or "resume upload failed")
        return delta

    if action.action == "submit":
        target = selector or (
            "button[type='submit'], input[type='submit'], "
            "button:has-text('Submit'), button:has-text('Apply'), "
            "button:has-text('Send')"
        )
        await human_click(page, target)
        try:
            await page.wait_for_load_state("networkidle", timeout=15_000)
        except Exception:
            pass
        return 0

    if selector is None:
        return 0

    if action.action == "click":
        await human_click(page, selector)
        return 0

    value: str | None = None
    if action.cv_key:
        resolved = resolve_mapped_value(cv_data, action.cv_key)
        value = None if resolved is None else str(resolved)
    elif action.value:
        value = action.value

    if action.action == "select" and value:
        await page.select_option(selector, label=value)
        return 1

    if action.action == "type" and value:
        await human_type(page, selector, value)
        return 1

    return 0
