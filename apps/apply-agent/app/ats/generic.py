"""Generic ATS handler — LLM-assisted fallback.

When no specialised handler matches, this module extracts the
page's form HTML, sends it to Claude Sonnet 4.6 for field mapping,
and fills/submits using the AI-generated instructions.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.resume_upload import require_resume_upload
from app.llm.field_mapper import map_fields_with_llm
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class GenericHandler(ATSHandler):
    ats_name = "generic"

    async def detect(self, page: Page) -> bool:
        """Always returns True — this is the catch-all fallback."""
        return True

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Extract all visible form fields from any page structure."""
        fields: list[FormField] = []

        # Grab all form inputs generically
        inputs = await page.query_selector_all(
            "form input:not([type='hidden']), form textarea, form select"
        )
        for elem in inputs:
            tag = await elem.evaluate("el => el.tagName.toLowerCase()")
            elem_id = await elem.get_attribute("id") or ""
            elem_name = await elem.get_attribute("name") or ""
            placeholder = await elem.get_attribute("placeholder") or ""
            elem_type = await elem.get_attribute("type") or "text"

            selector = (
                f"#{elem_id}"
                if elem_id
                else f"[name='{elem_name}']"
                if elem_name
                else ""
            )
            if not selector:
                continue

            if tag == "select":
                options = await elem.query_selector_all("option")
                opt_texts = [(await o.inner_text()).strip() for o in options]
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
        """Fill fields using LLM-generated mapping and submit.

        If ``field_mapping`` is empty, this method calls the LLM
        field mapper to generate one from the page's form HTML and
        the user's CV data.
        """
        filled = 0

        try:
            # If no mapping was provided, ask the LLM
            if not field_mapping:
                form_html = await page.evaluate(
                    "() => document.querySelector('form')?.outerHTML || document.body.innerHTML.substring(0, 15000)"
                )
                fields = await self.extract_fields(page)
                field_mapping = await map_fields_with_llm(fields, cv_data, form_html)

            ok, error, resume_filled = await require_resume_upload(
                page, cv_data, self.ats_name
            )
            if not ok:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=error,
                )
            filled += resume_filled

            for selector, cv_key in field_mapping.items():
                value = resolve_mapped_value(cv_data, cv_key)
                if value is None:
                    continue

                field_el = await page.query_selector(selector)
                if field_el is None:
                    continue

                tag = await field_el.evaluate("el => el.tagName.toLowerCase()")
                input_type = await field_el.get_attribute("type") or ""

                if input_type == "file":
                    continue
                elif input_type == "checkbox":
                    await human_click(page, selector)
                elif tag == "select":
                    await page.select_option(selector, label=str(value))
                else:
                    await human_type(page, selector, str(value))

                filled += 1

            await random_pause(1.0, 2.0)

            # Try common submit selectors
            submit_btn = await page.query_selector(
                "button[type='submit'], input[type='submit'], "
                "button:has-text('Submit'), button:has-text('Apply'), "
                "button:has-text('Send')"
            )
            if submit_btn:
                await human_click(
                    page,
                    "button[type='submit'], input[type='submit'], "
                    "button:has-text('Submit'), button:has-text('Apply'), "
                    "button:has-text('Send')",
                )
                await page.wait_for_load_state("networkidle", timeout=15_000)

            logger.info("Generic: filled %d fields and submitted", filled)
            return FillResult(
                success=True, ats_type=self.ats_name, fields_filled=filled
            )

        except Exception as e:
            logger.error("Generic fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
