"""Greenhouse ATS handler.

Greenhouse boards typically live at ``boards.greenhouse.io/<company>/jobs/<id>``
and use a fairly standard HTML form structure.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path

from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.resume_upload import prepare_resume_file
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_SUCCESS_PATTERNS = (
    "thank you for applying",
    "application submitted",
    "your application has been submitted",
    "we've received your application",
    "we have received your application",
)


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

    async def _get_label_text(self, page: Page, element) -> str:
        field_id = await element.get_attribute("id") or ""
        if field_id:
            label_el = await page.query_selector(f"label[for='{field_id}']")
            if label_el:
                return (await label_el.inner_text()).strip()

        aria_label = await element.get_attribute("aria-label")
        if aria_label:
            return aria_label.strip()

        labelled_by = await element.get_attribute("aria-labelledby")
        if labelled_by:
            parts: list[str] = []
            for label_id in labelled_by.split():
                label_el = await page.query_selector(f"#{label_id}")
                if label_el:
                    text = (await label_el.inner_text()).strip()
                    if text:
                        parts.append(text)
            if parts:
                return " ".join(parts)

        return ""

    async def _find_combobox_option(self, page: Page, field_id: str, value: str):
        listbox_selector = f"#react-select-{field_id}-listbox [role='option']"
        option_locator = page.locator(listbox_selector)
        try:
            await option_locator.first.wait_for(timeout=2_500)
        except PlaywrightTimeoutError:
            return None

        option_count = await option_locator.count()
        value_norm = re.sub(r"\s+", " ", value.strip().lower())

        for idx in range(option_count):
            option = option_locator.nth(idx)
            text = (await option.inner_text()).strip()
            text_norm = re.sub(r"\s+", " ", text.lower())
            if text_norm == value_norm or text_norm.startswith(value_norm):
                return option

        for idx in range(option_count):
            option = option_locator.nth(idx)
            text = (await option.inner_text()).strip()
            text_norm = re.sub(r"\s+", " ", text.lower())
            if value_norm in text_norm:
                return option

        return option_locator.first if option_count else None

    async def _fill_combobox(self, page: Page, selector: str, value: str) -> bool:
        field_el = await page.query_selector(selector)
        if field_el is None:
            return False

        field_id = await field_el.get_attribute("id") or ""
        if not field_id:
            return False

        await field_el.click()
        await random_pause(0.2, 0.5)
        await page.keyboard.press("Meta+A")
        await page.keyboard.press("Backspace")
        await page.keyboard.type(value, delay=60)

        option = await self._find_combobox_option(page, field_id, value)
        if option is None:
            logger.warning(
                "Greenhouse combobox option not found for %s=%s", selector, value
            )
            return False

        await option.click()
        await random_pause(0.2, 0.5)
        return True

    async def _upload_resume(self, page: Page, resume_path: Path) -> bool:
        file_inputs = await page.query_selector_all("input[type='file']")
        for file_input in file_inputs:
            try:
                await file_input.set_input_files(str(resume_path))
                uploaded = await file_input.evaluate(
                    "el => Boolean(el.files && el.files.length > 0)"
                )
                if uploaded:
                    return True
            except Exception as exc:
                logger.warning("Greenhouse resume upload attempt failed: %s", exc)
        return False

    async def _get_validation_errors(self, page: Page) -> list[str]:
        errors = await page.evaluate(
            """() => {
                const nodes = [
                  ...document.querySelectorAll('[id$="-error"]'),
                  ...document.querySelectorAll('[role="alert"]'),
                  ...document.querySelectorAll('.error')
                ];
                const unique = [];
                for (const node of nodes) {
                  const text = (node.textContent || '').trim();
                  if (!text) continue;
                  if (!unique.includes(text)) unique.push(text);
                }
                return unique;
            }"""
        )
        return [err for err in errors if err]

    async def _is_submission_successful(self, page: Page, initial_url: str) -> bool:
        body_text = (await page.locator("body").inner_text()).lower()
        if any(pattern in body_text for pattern in _SUCCESS_PATTERNS):
            return True

        current_url = page.url
        if current_url != initial_url and "/jobs/" not in current_url:
            return True

        form_still_present = await page.query_selector("form") is not None
        return not form_still_present

    async def extract_fields(self, page: Page) -> list[FormField]:
        """Parse Greenhouse form fields."""
        fields: list[FormField] = []
        seen_selectors: set[str] = set()

        # Text inputs excluding custom combobox widgets.
        inputs = await page.query_selector_all(
            "input[type='text']:not([role='combobox']), input[type='email'], input[type='tel'], input[type='url']"
        )
        for inp in inputs:
            field_id = await inp.get_attribute("id") or ""
            name = await inp.get_attribute("name") or field_id
            selector = f"#{field_id}" if field_id else f"input[name='{name}']"
            if selector in seen_selectors:
                continue
            required = (
                await inp.get_attribute("required") is not None
                or (await inp.get_attribute("aria-required")) == "true"
            )
            label_text = await self._get_label_text(page, inp)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or name,
                    field_type="text",
                    required=required,
                )
            )
            seen_selectors.add(selector)

        # React Select / combobox widgets used by Greenhouse.
        comboboxes = await page.query_selector_all("input[role='combobox']")
        for combo in comboboxes:
            field_id = await combo.get_attribute("id") or ""
            name = await combo.get_attribute("name") or field_id
            aria_label = (await combo.get_attribute("aria-label") or "").strip().lower()
            placeholder = (
                (await combo.get_attribute("placeholder") or "").strip().lower()
            )
            if (
                field_id.endswith("__search-input")
                or aria_label == "search"
                or placeholder == "search"
            ):
                continue
            selector = f"#{field_id}" if field_id else f"input[name='{name}']"
            if selector in seen_selectors:
                continue
            required = (
                await combo.get_attribute("required") is not None
                or (await combo.get_attribute("aria-required")) == "true"
            )
            label_text = await self._get_label_text(page, combo)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or name,
                    field_type="select",
                    required=required,
                )
            )
            seen_selectors.add(selector)

        # Textareas
        textareas = await page.query_selector_all("textarea")
        for ta in textareas:
            ta_id = await ta.get_attribute("id") or ""
            ta_name = await ta.get_attribute("name") or ta_id
            if ta_name == "g-recaptcha-response" or ta_id.startswith(
                "g-recaptcha-response"
            ):
                continue
            selector = f"#{ta_id}" if ta_id else f"textarea[name='{ta_name}']"
            if selector in seen_selectors:
                continue
            label_text = await self._get_label_text(page, ta)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or ta_name,
                    field_type="textarea",
                )
            )
            seen_selectors.add(selector)

        # Native select dropdowns.
        selects = await page.query_selector_all("select")
        for sel in selects:
            sel_id = await sel.get_attribute("id") or ""
            sel_name = await sel.get_attribute("name") or sel_id
            selector = f"#{sel_id}" if sel_id else f"select[name='{sel_name}']"
            if selector in seen_selectors:
                continue
            options = await sel.query_selector_all("option")
            option_texts = []
            for opt in options:
                text = (await opt.inner_text()).strip()
                if text:
                    option_texts.append(text)
            label_text = await self._get_label_text(page, sel)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or sel_name,
                    field_type="select",
                    options=option_texts,
                )
            )
            seen_selectors.add(selector)

        # File upload (resume)
        file_inputs = await page.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("id") or ""
            fi_name = await fi.get_attribute("name") or fi_id
            selector = f"#{fi_id}" if fi_id else f"input[name='{fi_name}']"
            if selector in seen_selectors:
                continue
            label_text = await self._get_label_text(page, fi)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or fi_name,
                    field_type="file",
                )
            )
            seen_selectors.add(selector)

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
        initial_url = page.url
        try:
            async with prepare_resume_file(cv_data) as resume_path:
                for selector, cv_key in field_mapping.items():
                    value = resolve_mapped_value(cv_data, cv_key)
                    if value is None:
                        continue

                    field_el = await page.query_selector(selector)
                    if field_el is None:
                        logger.info(
                            "Greenhouse: selector not found during fill: %s", selector
                        )
                        continue

                    tag = await field_el.evaluate("el => el.tagName.toLowerCase()")
                    role = await field_el.get_attribute("role") or ""

                    if tag == "select":
                        await page.select_option(selector, label=str(value))
                        filled += 1
                    elif tag == "input":
                        input_type = await field_el.get_attribute("type") or "text"
                        if input_type == "file":
                            continue
                        if role == "combobox":
                            selected = await self._fill_combobox(
                                page, selector, str(value)
                            )
                            if not selected:
                                continue
                            filled += 1
                        else:
                            await human_type(page, selector, str(value))
                            filled += 1
                    elif tag == "textarea":
                        await human_type(page, selector, str(value))
                        filled += 1

                has_file_input = (
                    await page.query_selector("input[type='file']")
                ) is not None
                if has_file_input:
                    if resume_path is None:
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error="Resume file not available for upload",
                        )

                    uploaded = await self._upload_resume(page, resume_path)
                    if not uploaded:
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error="Resume upload failed",
                        )
                    filled += 1

                await random_pause(1.0, 2.0)

            submit_selector = (
                "button[type='submit'], input[type='submit'], "
                "button:has-text('Submit'), button:has-text('Apply')"
            )
            submit_btn = await page.query_selector(submit_selector)
            if submit_btn is None:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error="Submit button not found",
                )

            await human_click(page, submit_selector)
            try:
                await page.wait_for_load_state("networkidle", timeout=10_000)
            except PlaywrightTimeoutError:
                logger.info("Greenhouse: networkidle wait timed out after submit")

            await random_pause(0.8, 1.5)

            if await self._is_submission_successful(page, initial_url):
                logger.info(
                    "Greenhouse: filled %d fields and confirmed submission", filled
                )
                return FillResult(
                    success=True,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                )

            validation_errors = await self._get_validation_errors(page)
            if validation_errors:
                error_summary = "; ".join(validation_errors[:5])
                logger.info(
                    "Greenhouse: submit blocked by validation after filling %d fields: %s",
                    filled,
                    error_summary,
                )
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=error_summary,
                )

            logger.info(
                "Greenhouse: submit did not reach confirmation after filling %d fields",
                filled,
            )
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error="Submit did not reach a confirmation page",
            )

        except Exception as e:
            logger.error("Greenhouse fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
