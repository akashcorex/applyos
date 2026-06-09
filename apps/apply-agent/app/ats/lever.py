"""Lever ATS handler.

Lever application pages are at ``jobs.lever.co/<company>/<id>/apply``
with a clean, single-page form.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField
from app.browser.human_delay import human_click, human_type, random_pause
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class LeverHandler(ATSHandler):
    ats_name = "lever"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "lever.co" in url:
            return True
        lever_el = await page.query_selector(".lever-application-form, .application-form")
        return lever_el is not None

    async def extract_fields(self, page: Page) -> list[FormField]:
        fields: list[FormField] = []

        # Lever uses fairly standard HTML forms
        inputs = await page.query_selector_all(
            ".application-form input[type='text'], "
            ".application-form input[type='email'], "
            ".application-form input[type='tel'], "
            ".application-form input[type='url']"
        )
        for inp in inputs:
            inp_name = await inp.get_attribute("name") or ""
            inp_id = await inp.get_attribute("id") or ""
            placeholder = await inp.get_attribute("placeholder") or ""
            fields.append(FormField(
                selector=f"#{inp_id}" if inp_id else f"input[name='{inp_name}']",
                label=placeholder or inp_name or inp_id,
                field_type="text",
            ))

        # Textareas (cover letter, additional info)
        textareas = await page.query_selector_all(".application-form textarea")
        for ta in textareas:
            ta_name = await ta.get_attribute("name") or ""
            ta_id = await ta.get_attribute("id") or ""
            fields.append(FormField(
                selector=f"#{ta_id}" if ta_id else f"textarea[name='{ta_name}']",
                label=ta_name or ta_id,
                field_type="textarea",
            ))

        # File upload
        file_inputs = await page.query_selector_all(".application-form input[type='file']")
        for fi in file_inputs:
            fi_name = await fi.get_attribute("name") or "resume"
            fields.append(FormField(
                selector=f"input[name='{fi_name}']",
                label=fi_name,
                field_type="file",
            ))

        logger.info("Lever: extracted %d fields", len(fields))
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
                    logger.info("Lever file upload skipped (not yet implemented)")
                    continue

                await human_type(page, selector, str(value))
                filled += 1

            await random_pause(1.0, 2.0)

            submit_btn = await page.query_selector(
                "button[type='submit'], button:has-text('Submit application')"
            )
            if submit_btn:
                await human_click(page, "button[type='submit'], button:has-text('Submit application')")
                await page.wait_for_load_state("networkidle", timeout=15_000)

            logger.info("Lever: filled %d fields and submitted", filled)
            return FillResult(success=True, ats_type=self.ats_name, fields_filled=filled)

        except Exception as e:
            logger.error("Lever fill failed: %s", e)
            return FillResult(success=False, ats_type=self.ats_name, fields_filled=filled, error=str(e))
