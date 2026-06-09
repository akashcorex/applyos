"""Ashby ATS handler.

Ashby job pages live at ``jobs.ashbyhq.com/<company>/<id>``
and use a React-rendered application form.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField
from app.browser.human_delay import human_click, human_type, random_pause
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class AshbyHandler(ATSHandler):
    ats_name = "ashby"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "ashbyhq.com" in url:
            return True
        ashby_el = await page.query_selector("[data-testid='application-form']")
        return ashby_el is not None

    async def extract_fields(self, page: Page) -> list[FormField]:
        fields: list[FormField] = []

        # Ashby renders forms with data-testid attributes
        inputs = await page.query_selector_all(
            "input[type='text'], input[type='email'], input[type='tel']"
        )
        for inp in inputs:
            inp_id = await inp.get_attribute("id") or ""
            inp_name = await inp.get_attribute("name") or ""
            placeholder = await inp.get_attribute("placeholder") or ""
            label_text = placeholder or inp_name or inp_id
            selector = f"#{inp_id}" if inp_id else f"input[name='{inp_name}']"
            fields.append(FormField(
                selector=selector,
                label=label_text,
                field_type="text",
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

        # File upload
        file_inputs = await page.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("id") or ""
            fields.append(FormField(
                selector=f"#{fi_id}" if fi_id else "input[type='file']",
                label="resume",
                field_type="file",
            ))

        logger.info("Ashby: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        try:
            for selector, cv_key in field_mapping.items():
                value = getattr(cv_data, cv_key, None)
                if value is None:
                    continue
                field_el = await page.query_selector(selector)
                if field_el is None:
                    continue

                input_type = await field_el.get_attribute("type") or ""
                if input_type == "file":
                    logger.info("Ashby file upload skipped (not yet implemented)")
                    continue

                await human_type(page, selector, str(value))
                filled += 1

            await random_pause(1.0, 2.0)

            submit_btn = await page.query_selector(
                "button[type='submit'], button:has-text('Submit'), button:has-text('Apply')"
            )
            if submit_btn:
                await human_click(page, "button[type='submit'], button:has-text('Submit'), button:has-text('Apply')")
                await page.wait_for_load_state("networkidle", timeout=15_000)

            logger.info("Ashby: filled %d fields and submitted", filled)
            return FillResult(success=True, ats_type=self.ats_name, fields_filled=filled)

        except Exception as e:
            logger.error("Ashby fill failed: %s", e)
            return FillResult(success=False, ats_type=self.ats_name, fields_filled=filled, error=str(e))
