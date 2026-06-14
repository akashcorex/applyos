"""LinkedIn Easy Apply handler.

Handles the multi-step Easy Apply modal that pops up on LinkedIn
job pages. Requires an active LinkedIn session.
"""

from __future__ import annotations

import logging

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import human_click, human_type, random_pause
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)


class EasyApplyHandler(ATSHandler):
    ats_name = "easy_apply"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "linkedin.com/jobs" not in url:
            return False
        # Check for the Easy Apply button
        easy_btn = await page.query_selector(
            "button:has-text('Easy Apply'), button.jobs-apply-button"
        )
        return easy_btn is not None

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Extract fields from the Easy Apply modal.

        LinkedIn renders the modal dynamically — we need to open it
        first, then parse the form inputs inside.
        """
        fields: list[FormField] = []

        # Click Easy Apply to open the modal
        easy_btn = await page.query_selector(
            "button:has-text('Easy Apply'), button.jobs-apply-button"
        )
        if easy_btn:
            await human_click(
                page, "button:has-text('Easy Apply'), button.jobs-apply-button"
            )
            await random_pause(1.5, 3.0)

        # Parse modal fields
        modal = await page.query_selector(
            "div.jobs-easy-apply-modal, div[class*='jobs-easy-apply']"
        )
        if not modal:
            logger.warning("Easy Apply modal not found")
            return fields

        inputs = await modal.query_selector_all(
            "input[type='text'], input[type='email'], input[type='tel']"
        )
        for inp in inputs:
            inp_id = await inp.get_attribute("id") or ""
            label_text = ""
            if inp_id:
                label_el = await page.query_selector(f"label[for='{inp_id}']")
                if label_el:
                    label_text = (await label_el.inner_text()).strip()
            fields.append(
                FormField(
                    selector=f"#{inp_id}" if inp_id else "input",
                    label=label_text or inp_id,
                    field_type="text",
                )
            )

        # Select dropdowns inside modal
        selects = await modal.query_selector_all("select")
        for sel in selects:
            sel_id = await sel.get_attribute("id") or ""
            options = await sel.query_selector_all("option")
            opt_texts = [(await o.inner_text()).strip() for o in options]
            fields.append(
                FormField(
                    selector=f"#{sel_id}" if sel_id else "select",
                    label=sel_id,
                    field_type="select",
                    options=opt_texts,
                )
            )

        # File upload
        file_inputs = await modal.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("id") or ""
            fields.append(
                FormField(
                    selector=f"#{fi_id}" if fi_id else "input[type='file']",
                    label="resume",
                    field_type="file",
                )
            )

        logger.info("Easy Apply: extracted %d fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        """Fill the Easy Apply modal and click through to submit.

        LinkedIn Easy Apply often has multiple pages within the modal.
        We fill the current page, click Next, and repeat until Submit.
        """
        filled = 0
        max_pages = 5  # safety limit

        try:
            for _page_num in range(max_pages):
                # Fill current page fields
                for selector, cv_key in field_mapping.items():
                    value = resolve_mapped_value(cv_data, cv_key)
                    if value is None:
                        continue
                    field_el = await page.query_selector(selector)
                    if field_el is None:
                        continue

                    input_type = await field_el.get_attribute("type") or ""
                    if input_type == "file":
                        logger.info(
                            "Easy Apply file upload skipped (not yet implemented)"
                        )
                        continue

                    await human_type(page, selector, str(value))
                    filled += 1

                await random_pause(0.8, 1.5)

                # Check for Submit vs Next
                submit_btn = await page.query_selector(
                    "button:has-text('Submit application'), "
                    "button[aria-label='Submit application']"
                )
                if submit_btn:
                    await human_click(
                        page,
                        "button:has-text('Submit application'), "
                        "button[aria-label='Submit application']",
                    )
                    await random_pause(2.0, 3.0)
                    logger.info("Easy Apply: submitted after filling %d fields", filled)
                    return FillResult(
                        success=True, ats_type=self.ats_name, fields_filled=filled
                    )

                # Try Next button
                next_btn = await page.query_selector(
                    "button:has-text('Next'), button:has-text('Continue'), "
                    "button[aria-label='Continue to next step']"
                )
                if next_btn:
                    await human_click(
                        page,
                        "button:has-text('Next'), button:has-text('Continue'), "
                        "button[aria-label='Continue to next step']",
                    )
                    await random_pause(1.0, 2.0)
                else:
                    break  # no more pages

            logger.info(
                "Easy Apply: filled %d fields (submit button not found)", filled
            )
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error="Submit button not found",
            )

        except Exception as e:
            logger.error("Easy Apply fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
