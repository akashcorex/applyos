"""Greenhouse ATS handler.

Greenhouse boards typically live at ``boards.greenhouse.io/<company>/jobs/<id>``
and use a fairly standard HTML form structure.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField
from app.browser.human_delay import human_click, human_type, random_pause
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class GreenhouseHandler(ATSHandler):
    ats_name = "greenhouse"

    async def detect(self, page: Page) -> bool:
        """Check if the page is a Greenhouse application form."""
        url = page.url.lower()
        if "greenhouse.io" in url:
            return True
        # Fallback: look for Greenhouse-specific meta tag
        meta = await page.query_selector("meta[content*='Greenhouse']")
        return meta is not None

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Parse Greenhouse form fields."""
        fields: list[FormField] = []

        # Text inputs
        inputs = await page.query_selector_all("input[type='text'], input[type='email'], input[type='tel'], input[type='url']")
        for inp in inputs:
            label_text = ""
            field_id = await inp.get_attribute("id") or ""
            # Try to find associated label
            if field_id:
                label_el = await page.query_selector(f"label[for='{field_id}']")
                if label_el:
                    label_text = (await label_el.inner_text()).strip()
            name = await inp.get_attribute("name") or field_id
            required = await inp.get_attribute("required") is not None
            fields.append(FormField(
                selector=f"#{field_id}" if field_id else f"input[name='{name}']",
                label=label_text or name,
                field_type="text",
                required=required,
            ))

        # Textareas
        textareas = await page.query_selector_all("textarea")
        for ta in textareas:
            ta_id = await ta.get_attribute("id") or ""
            ta_name = await ta.get_attribute("name") or ta_id
            fields.append(FormField(
                selector=f"#{ta_id}" if ta_id else f"textarea[name='{ta_name}']",
                label=ta_name,
                field_type="textarea",
            ))

        # Select dropdowns
        selects = await page.query_selector_all("select")
        for sel in selects:
            sel_id = await sel.get_attribute("id") or ""
            sel_name = await sel.get_attribute("name") or sel_id
            options = await sel.query_selector_all("option")
            option_texts = []
            for opt in options:
                text = (await opt.inner_text()).strip()
                if text:
                    option_texts.append(text)
            fields.append(FormField(
                selector=f"#{sel_id}" if sel_id else f"select[name='{sel_name}']",
                label=sel_name,
                field_type="select",
                options=option_texts,
            ))

        # File upload (resume)
        file_inputs = await page.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("id") or ""
            fi_name = await fi.get_attribute("name") or fi_id
            fields.append(FormField(
                selector=f"#{fi_id}" if fi_id else f"input[name='{fi_name}']",
                label=fi_name,
                field_type="file",
            ))

        logger.info("Greenhouse: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        """Fill Greenhouse form fields and submit."""
        filled = 0
        try:
            for selector, cv_key in field_mapping.items():
                value = getattr(cv_data, cv_key, None)
                if value is None:
                    continue

                field_el = await page.query_selector(selector)
                if field_el is None:
                    continue

                tag = await field_el.evaluate("el => el.tagName.toLowerCase()")

                if tag == "select":
                    await page.select_option(selector, label=str(value))
                elif tag == "input":
                    input_type = await field_el.get_attribute("type") or "text"
                    if input_type == "file" and cv_data.resume_url:
                        # TODO: download resume to temp file and upload
                        logger.info("File upload skipped (not yet implemented)")
                        continue
                    else:
                        await human_type(page, selector, str(value))
                elif tag == "textarea":
                    await human_type(page, selector, str(value))

                filled += 1

            await random_pause(1.0, 2.0)

            # Submit the form
            submit_btn = await page.query_selector(
                "button[type='submit'], input[type='submit'], "
                "button:has-text('Submit'), button:has-text('Apply')"
            )
            if submit_btn:
                await human_click(page, "button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Apply')")
                await page.wait_for_load_state("networkidle", timeout=15_000)

            logger.info("Greenhouse: filled %d fields and submitted", filled)
            return FillResult(success=True, ats_type=self.ats_name, fields_filled=filled)

        except Exception as e:
            logger.error("Greenhouse fill failed: %s", e)
            return FillResult(success=False, ats_type=self.ats_name, fields_filled=filled, error=str(e))
