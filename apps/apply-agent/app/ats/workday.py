"""Workday ATS handler.

Workday applications are notoriously complex — multi-page flows
with dynamic rendering. This handler navigates the multi-step
wizard, filling each page sequentially.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField
from app.browser.human_delay import human_click, human_type, random_pause
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class WorkdayHandler(ATSHandler):
    ats_name = "workday"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "myworkdayjobs.com" in url or "workday.com" in url:
            return True
        # Workday apps often have a specific data attribute
        wd_el = await page.query_selector("[data-automation-id]")
        return wd_el is not None

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Extract fields from a Workday application page.

        Workday uses ``data-automation-id`` attributes extensively,
        so we prefer those as selectors for reliability.
        """
        fields: list[FormField] = []

        # Workday text inputs
        inputs = await page.query_selector_all(
            "input[data-automation-id], input[type='text'], input[type='email']"
        )
        for inp in inputs:
            auto_id = await inp.get_attribute("data-automation-id") or ""
            inp_id = await inp.get_attribute("id") or ""
            placeholder = await inp.get_attribute("placeholder") or ""
            selector = (
                f"[data-automation-id='{auto_id}']" if auto_id
                else f"#{inp_id}" if inp_id
                else ""
            )
            if not selector:
                continue

            fields.append(FormField(
                selector=selector,
                label=auto_id or placeholder or inp_id,
                field_type="text",
            ))

        # File upload
        file_inputs = await page.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("data-automation-id") or await fi.get_attribute("id") or ""
            fields.append(FormField(
                selector=f"[data-automation-id='{fi_id}']" if fi_id else "input[type='file']",
                label="resume_upload",
                field_type="file",
            ))

        # Dropdowns (Workday custom selects)
        dropdowns = await page.query_selector_all(
            "button[data-automation-id*='dropdown'], select[data-automation-id]"
        )
        for dd in dropdowns:
            dd_id = await dd.get_attribute("data-automation-id") or ""
            fields.append(FormField(
                selector=f"[data-automation-id='{dd_id}']",
                label=dd_id,
                field_type="select",
            ))

        logger.info("Workday: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        """Fill Workday form across potentially multiple pages."""
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
                input_type = await field_el.get_attribute("type") or ""

                if input_type == "file":
                    logger.info("Workday file upload skipped (not yet implemented)")
                    continue
                elif tag in ("input", "textarea"):
                    # Clear existing value first
                    await field_el.click(click_count=3)
                    await human_type(page, selector, str(value))
                elif tag in ("button", "select"):
                    await human_click(page, selector)
                    await random_pause(0.5, 1.0)
                    # Try to find and click the matching option
                    option = await page.query_selector(f"div[data-automation-id*='option']:has-text('{value}')")
                    if option:
                        await option.click()

                filled += 1

            await random_pause(1.0, 2.0)

            # Look for Next/Submit button
            next_btn = await page.query_selector(
                "button[data-automation-id='bottom-navigation-next-button'], "
                "button:has-text('Submit'), button:has-text('Next')"
            )
            if next_btn:
                await human_click(
                    page,
                    "button[data-automation-id='bottom-navigation-next-button'], "
                    "button:has-text('Submit'), button:has-text('Next')"
                )
                await page.wait_for_load_state("networkidle", timeout=15_000)

            logger.info("Workday: filled %d fields", filled)
            return FillResult(success=True, ats_type=self.ats_name, fields_filled=filled)

        except Exception as e:
            logger.error("Workday fill failed: %s", e)
            return FillResult(success=False, ats_type=self.ats_name, fields_filled=filled, error=str(e))
