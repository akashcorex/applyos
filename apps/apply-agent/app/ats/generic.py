"""Generic ATS handler — structured fill first, then bounded observe-act loop."""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import (
    ATSHandler,
    FillResult,
    FormField,
    normalize_selector,
    resolve_mapped_value,
)
from app.browser.dom import first_visible
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

EXTRACT_FIELDS_JS = """
() => {
  const results = [];
  const seen = new Set();
  const controls = document.querySelectorAll(
    'form input:not([type="hidden"]), form textarea, form select, ' +
    'input:not([type="hidden"]), textarea, select'
  );
  for (const el of controls) {
    const tag = el.tagName.toLowerCase();
    const id = el.id || '';
    const name = el.getAttribute('name') || '';
    let selector = '';
    if (id) {
      selector = id.match(/^[A-Za-z_-][\\w-]*$/) ? `#${id}` : `[id="${id.replace(/"/g, '\\\\"')}"]`;
    } else if (name) {
      selector = `[name="${name.replace(/"/g, '\\\\"')}"]`;
    }
    if (!selector || seen.has(selector)) continue;
    seen.add(selector);

    let label = '';
    if (id) {
      const labelEl = document.querySelector(`label[for="${id.replace(/"/g, '\\\\"')}"]`);
      if (labelEl) label = (labelEl.innerText || labelEl.textContent || '').trim();
    }
    if (!label) {
      const parentLabel = el.closest('label');
      if (parentLabel) label = (parentLabel.innerText || parentLabel.textContent || '').trim();
    }
    if (!label) label = (el.getAttribute('aria-label') || '').trim();
    if (!label) label = (el.getAttribute('placeholder') || '').trim();
    if (!label) label = name || id;

    const inputType = (el.getAttribute('type') || 'text').toLowerCase();
    const required = el.required || el.getAttribute('aria-required') === 'true';
    let fieldType = 'text';
    let options = null;
    if (tag === 'select') {
      fieldType = 'select';
      options = Array.from(el.options).map((opt) => (opt.textContent || '').trim()).filter(Boolean);
    } else if (tag === 'textarea') {
      fieldType = 'textarea';
    } else if (inputType === 'file') {
      fieldType = 'file';
    } else if (inputType === 'checkbox') {
      fieldType = 'checkbox';
    } else if (inputType === 'radio') {
      fieldType = 'radio';
    }

    results.push({
      selector,
      label,
      field_type: fieldType,
      required,
      options,
    });
  }
  return results;
}
"""


def field_from_snapshot(item: dict[str, object]) -> FormField | None:
    selector = str(item.get("selector", "")).strip()
    if not selector:
        return None
    options = item.get("options")
    return FormField(
        selector=selector,
        label=str(item.get("label", selector)),
        field_type=str(item.get("field_type", "text")),
        required=bool(item.get("required", False)),
        options=options if isinstance(options, list) else None,
    )


class GenericHandler(ATSHandler):
    ats_name = "generic"
    uses_agentic_fill = True

    async def detect(self, page: Page) -> bool:
        return True

    async def extract_fields(self, page: Page) -> list[FormField]:
        raw_items = await page.evaluate(EXTRACT_FIELDS_JS)
        fields: list[FormField] = []
        for item in raw_items:
            if not isinstance(item, dict):
                continue
            field = field_from_snapshot(item)
            if field is not None:
                fields.append(field)
        logger.info("Generic: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        if field_mapping:
            filled += await self._fill_mapped_fields(page, cv_data, field_mapping)
            success = await self._looks_submitted(page)
            if success:
                return FillResult(
                    success=True,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                )

        agentic = await self._agentic_fill(page, cv_data, filled)
        return agentic

    async def _fill_mapped_fields(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> int:
        filled = 0
        for raw_selector, cv_key in field_mapping.items():
            selector = normalize_selector(raw_selector)
            value = resolve_mapped_value(cv_data, cv_key)
            if value is None:
                continue

            field_el = await first_visible(page, selector)
            if field_el is None:
                continue

            tag = await field_el.evaluate("el => el.tagName.toLowerCase()")
            input_type = (await field_el.get_attribute("type") or "text").lower()

            if tag == "select":
                await page.select_option(selector, label=str(value))
                filled += 1
            elif tag == "textarea":
                await human_type(page, selector, str(value))
                filled += 1
            elif tag == "input" and input_type == "file":
                ok, error, delta = await require_resume_upload(page, cv_data, "generic")
                if not ok:
                    logger.warning("Generic resume upload failed: %s", error)
                else:
                    filled += delta
            elif tag == "input" and input_type == "checkbox":
                if str(value).lower() in {"true", "yes", "1", "on"}:
                    await human_click(page, selector)
                    filled += 1
            else:
                await human_type(page, selector, str(value))
                filled += 1

            await random_pause(0.2, 0.5)
        return filled

    async def _looks_submitted(self, page: Page) -> bool:
        body_text = (await page.inner_text("body"))[:2000].lower()
        return any(
            token in body_text
            for token in (
                "thank you",
                "application submitted",
                "we've received",
                "we have received",
                "successfully applied",
            )
        )

    async def _agentic_fill(
        self,
        page: Page,
        cv_data: CVData,
        filled: int,
    ) -> FillResult:
        history: list[str] = []
        try:
            for step in range(MAX_AGENT_STEPS):
                body_text = (await page.inner_text("body"))[:2000]
                lowered = body_text.lower()
                if await self._looks_submitted(page):
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
