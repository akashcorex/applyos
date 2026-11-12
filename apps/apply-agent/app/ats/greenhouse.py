"""Greenhouse ATS handler.

Greenhouse boards typically live at ``boards.greenhouse.io/<company>/jobs/<id>``
and use a fairly standard HTML form structure.
"""

from __future__ import annotations

import json
import logging
import os
import re
from difflib import SequenceMatcher
from pathlib import Path

from playwright.async_api import Page
from playwright.async_api import TimeoutError as PlaywrightTimeoutError

from app.ats.base import (
    ATSHandler,
    FillResult,
    FormField,
    css_id_selector,
    normalize_selector,
    resolve_mapped_value,
)
from app.browser.dom import first_visible, safe_click
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.resume_upload import prepare_resume_file
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_COMBOBOX_OPTION_LIMIT = 12
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
                label_el = await page.query_selector(css_id_selector(label_id))
                if label_el:
                    text = (await label_el.inner_text()).strip()
                    if text:
                        parts.append(text)
            if parts:
                return " ".join(parts)

        return ""

    def _normalize_option_text(self, value: str) -> str:
        normalized = value.strip().lower()
        normalized = normalized.replace("&", " and ")
        normalized = normalized.replace("don't", "do not")
        normalized = normalized.replace("wish to answer", "want to answer")
        normalized = normalized.replace(
            "wish to self identify", "want to self identify"
        )
        normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
        normalized = re.sub(r"\s+", " ", normalized).strip()
        return normalized

    async def _find_combobox_option(
        self, page: Page, field_id: str, value: str, *, allow_fuzzy: bool = False
    ):
        listbox_selector = f"#react-select-{field_id}-listbox [role='option']"
        option_locator = page.locator(listbox_selector)
        try:
            await option_locator.first.wait_for(timeout=2_500)
        except PlaywrightTimeoutError:
            return None

        option_count = await option_locator.count()
        value_norm = self._normalize_option_text(value)
        best_option = None
        best_score = 0.0
        value_pattern = (
            re.compile(rf"\\b{re.escape(value_norm)}\\b") if value_norm else None
        )

        for idx in range(option_count):
            option = option_locator.nth(idx)
            text = (await option.inner_text()).strip()
            text_norm = self._normalize_option_text(text)
            if text_norm == value_norm or text_norm.startswith(value_norm):
                return option
            if value_pattern is not None and value_pattern.search(text_norm):
                return option

            if allow_fuzzy:
                score = SequenceMatcher(None, value_norm, text_norm).ratio()
                if score > best_score:
                    best_score = score
                    best_option = option

        if allow_fuzzy and best_option is not None and best_score >= 0.6:
            return best_option

        return None

    async def _extract_combobox_options(
        self, page: Page, selector: str
    ) -> list[str] | None:
        field_el = await page.query_selector(normalize_selector(selector))
        if field_el is None:
            return None

        field_id = await field_el.get_attribute("id") or ""
        if not field_id:
            return None

        try:
            await safe_click(field_el)
            await random_pause(0.1, 0.2)
            option_locator = page.locator(
                f"#react-select-{field_id}-listbox [role='option']"
            )
            await option_locator.first.wait_for(timeout=1_500)
            option_count = await option_locator.count()
            if option_count == 0 or option_count > _COMBOBOX_OPTION_LIMIT:
                return None

            options: list[str] = []
            for idx in range(option_count):
                text = (await option_locator.nth(idx).inner_text()).strip()
                if text:
                    options.append(text)
            return options or None
        except PlaywrightTimeoutError:
            return None
        finally:
            try:
                await page.keyboard.press("Escape")
                await random_pause(0.05, 0.15)
            except Exception:
                pass

    async def _fill_combobox(self, page: Page, selector: str, value: str) -> bool:
        field_el = await page.query_selector(normalize_selector(selector))
        if field_el is None:
            return False

        field_id = await field_el.get_attribute("id") or ""
        if not field_id:
            return False

        await safe_click(field_el)
        await random_pause(0.2, 0.5)

        option = await self._find_combobox_option(
            page, field_id, value, allow_fuzzy=False
        )
        if option is None:
            await page.keyboard.press("Meta+A")
            await page.keyboard.press("Backspace")
            await page.keyboard.type(value, delay=60)
            option = await self._find_combobox_option(
                page, field_id, value, allow_fuzzy=True
            )

        if option is None:
            logger.warning(
                "Greenhouse combobox option not found for %s=%s", selector, value
            )
            try:
                await page.keyboard.press("Escape")
            except Exception:
                pass
            return False

        await safe_click(option)
        await random_pause(0.2, 0.5)
        return True

    async def _normalize_phone_value(self, page: Page, value: object) -> str:
        digits = re.sub(r"\D", "", str(value))
        if not digits:
            return str(value)

        country_text = await page.evaluate(
            r"""() => {
                const el = document.querySelector('#country');
                if (!el) return '';
                const root = el.closest('[class*="select__control"]') || el.parentElement?.parentElement;
                return (root?.textContent || '').trim();
            }"""
        )
        match = re.search(r"\+(\d{1,4})", country_text or "")
        if match:
            country_code = match.group(1)
            if digits.startswith(country_code) and len(digits) > len(country_code):
                digits = digits[len(country_code) :]

        return digits

    async def _upload_resume(self, page: Page, resume_path: Path) -> bool:
        filename = os.path.basename(str(resume_path))

        try:
            attach_button = page.locator("form button").filter(has_text="Attach").first
            if await attach_button.count() > 0:
                async with page.expect_file_chooser() as chooser_info:
                    await safe_click(attach_button)
                chooser = await chooser_info.value
                await chooser.set_files(str(resume_path))
            else:
                file_inputs = await page.query_selector_all("input[type='file']")
                for file_input in file_inputs:
                    await file_input.set_input_files(str(resume_path))
                    uploaded = await file_input.evaluate(
                        "el => Boolean(el.files && el.files.length > 0)"
                    )
                    if uploaded:
                        break
                else:
                    return False

            try:
                await page.wait_for_function(
                    r"""(name) => {
                        const bodyText = document.body.innerText || '';
                        if (bodyText.includes(name)) {
                            return true;
                        }
                        return Boolean(document.querySelector('[aria-label="Remove file"]'));
                    }""",
                    arg=filename,
                    timeout=15_000,
                )
            except PlaywrightTimeoutError:
                logger.info(
                    "Greenhouse resume upload: filename did not appear after upload"
                )
                return False

            return True
        except Exception as exc:
            logger.warning("Greenhouse resume upload attempt failed: %s", exc)
            return False

    def _preview_value(self, value: object | None, limit: int = 80) -> str | None:
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        return text if len(text) <= limit else f"{text[:limit]}…"

    async def _collect_selector_snapshot(
        self, page: Page, selectors: list[str]
    ) -> list[dict[str, object]]:
        return await page.evaluate(
            r"""(selectors) => selectors.map((selector) => {
                const el = document.querySelector(selector);
                if (!el) {
                  return { selector, present: false };
                }

                const tag = el.tagName.toLowerCase();
                const type = el.getAttribute('type') || '';
                const role = el.getAttribute('role') || '';
                const label = (() => {
                  if (el.labels && el.labels.length) {
                    return [...el.labels].map((node) => (node.textContent || '').trim()).filter(Boolean).join(' ');
                  }
                  const ariaLabel = el.getAttribute('aria-label');
                  if (ariaLabel) return ariaLabel.trim();
                  const labelledBy = el.getAttribute('aria-labelledby');
                  if (labelledBy) {
                    return labelledBy
                      .split(/\s+/)
                      .map((id) => document.getElementById(id)?.textContent?.trim() || '')
                      .filter(Boolean)
                      .join(' ');
                  }
                  return '';
                })();

                let value = '';
                if (type === 'file') {
                  value = el.files && el.files.length ? [...el.files].map((file) => file.name).join(', ') : '';
                } else if (role === 'combobox') {
                  const root = el.closest('[class*="select__control"]') || el.parentElement?.parentElement;
                  value = (root?.textContent || '').trim();
                } else if (tag === 'select') {
                  value = el.selectedOptions ? [...el.selectedOptions].map((opt) => (opt.textContent || '').trim()).filter(Boolean).join(', ') : '';
                } else {
                  value = (el.value || '').trim();
                }

                return {
                  selector,
                  present: true,
                  id: el.id || null,
                  label: label || null,
                  tag,
                  type: type || null,
                  role: role || null,
                  required: el.required || el.getAttribute('aria-required') === 'true',
                  invalid: el.getAttribute('aria-invalid') === 'true',
                  disabled: Boolean(el.disabled),
                  value: value || null,
                };
            })""",
            selectors,
        )

    async def _collect_invalid_field_snapshot(
        self, page: Page
    ) -> list[dict[str, object]]:
        return await page.evaluate(
            r"""() => {
                const nodes = [...document.querySelectorAll('[aria-invalid="true"]')];
                return nodes.map((el) => {
                  const label = (() => {
                    if (el.labels && el.labels.length) {
                      return [...el.labels].map((node) => (node.textContent || '').trim()).filter(Boolean).join(' ');
                    }
                    const ariaLabel = el.getAttribute('aria-label');
                    if (ariaLabel) return ariaLabel.trim();
                    const labelledBy = el.getAttribute('aria-labelledby');
                    if (labelledBy) {
                      return labelledBy
                        .split(/\s+/)
                        .map((id) => document.getElementById(id)?.textContent?.trim() || '')
                        .filter(Boolean)
                        .join(' ');
                    }
                    return '';
                  })();

                  let value = '';
                  const tag = el.tagName.toLowerCase();
                  const role = el.getAttribute('role') || '';
                  const type = el.getAttribute('type') || '';
                  if (type === 'file') {
                    value = el.files && el.files.length ? [...el.files].map((file) => file.name).join(', ') : '';
                  } else if (role === 'combobox') {
                    const root = el.closest('[class*="select__control"]') || el.parentElement?.parentElement;
                    value = (root?.textContent || '').trim();
                  } else if (tag === 'select') {
                    value = el.selectedOptions ? [...el.selectedOptions].map((opt) => (opt.textContent || '').trim()).filter(Boolean).join(', ') : '';
                  } else {
                    value = (el.value || '').trim();
                  }

                  const describedBy = (el.getAttribute('aria-describedby') || '')
                    .split(/\s+/)
                    .map((id) => document.getElementById(id)?.textContent?.trim() || '')
                    .filter(Boolean);

                  return {
                    id: el.id || null,
                    label: label || null,
                    tag,
                    type: type || null,
                    role: role || null,
                    value: value || null,
                    describedBy,
                  };
                });
            }"""
        )

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
            selector = css_id_selector(field_id) if field_id else f"input[name='{name}']"
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
            selector = css_id_selector(field_id) if field_id else f"input[name='{name}']"
            if selector in seen_selectors:
                continue
            required = (
                await combo.get_attribute("required") is not None
                or (await combo.get_attribute("aria-required")) == "true"
            )
            label_text = await self._get_label_text(page, combo)
            options = await self._extract_combobox_options(page, selector)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text or name,
                    field_type="select",
                    required=required,
                    options=options,
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
            selector = css_id_selector(ta_id) if ta_id else f"textarea[name='{ta_name}']"
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
            selector = css_id_selector(sel_id) if sel_id else f"select[name='{sel_name}']"
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
            selector = css_id_selector(fi_id) if fi_id else f"input[name='{fi_name}']"
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

    async def _awaiting_security_code(self, page: Page) -> bool:
        """True when Greenhouse shows its emailed security-code prompt."""
        try:
            return await page.evaluate(
                """() => {
                  const body = (document.body?.innerText || '').toLowerCase();
                  if (/security code|verification code/.test(body)) return true;
                  return Array.from(
                    document.querySelectorAll('input[maxlength="1"]')
                  ).some((el) => el.offsetParent !== null);
                }"""
            )
        except Exception:
            return False

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
        *,
        auto_submit: bool = True,
    ) -> FillResult:
        """Fill Greenhouse form fields and optionally submit."""
        filled = 0
        initial_url = page.url
        fill_debug: list[dict[str, object]] = []
        try:
            async with prepare_resume_file(cv_data) as resume_path:
                for raw_selector, cv_key in field_mapping.items():
                    selector = normalize_selector(raw_selector)
                    value = resolve_mapped_value(cv_data, cv_key)
                    if value is None:
                        fill_debug.append(
                            {
                                "selector": selector,
                                "mapping": cv_key,
                                "resolved": None,
                                "status": "no_resolved_value",
                            }
                        )
                        continue

                    field_el = await first_visible(page, selector)
                    if field_el is None:
                        fill_debug.append(
                            {
                                "selector": selector,
                                "mapping": cv_key,
                                "resolved": self._preview_value(value),
                                "status": "selector_missing",
                            }
                        )
                        logger.info(
                            "Greenhouse: selector not found during fill: %s", selector
                        )
                        continue

                    tag = await field_el.evaluate("el => el.tagName.toLowerCase()")
                    role = await field_el.get_attribute("role") or ""
                    debug_entry = {
                        "selector": selector,
                        "mapping": cv_key,
                        "resolved": self._preview_value(value),
                        "tag": tag,
                        "role": role or None,
                        "status": "pending",
                    }

                    if tag == "select":
                        await page.select_option(selector, label=str(value))
                        filled += 1
                        debug_entry["status"] = "filled_select"
                    elif tag == "input":
                        input_type = await field_el.get_attribute("type") or "text"
                        debug_entry["input_type"] = input_type
                        if input_type == "file":
                            debug_entry["status"] = "deferred_file_upload"
                            fill_debug.append(debug_entry)
                            continue
                        if role == "combobox":
                            selected = await self._fill_combobox(
                                page, selector, str(value)
                            )
                            if not selected:
                                debug_entry["status"] = "combobox_option_not_found"
                                fill_debug.append(debug_entry)
                                continue
                            filled += 1
                            debug_entry["status"] = "filled_combobox"
                        else:
                            text_value = str(value)
                            if selector == "#phone":
                                text_value = await self._normalize_phone_value(
                                    page, value
                                )
                                debug_entry["normalized"] = self._preview_value(
                                    text_value
                                )
                            await human_type(page, selector, text_value)
                            filled += 1
                            debug_entry["status"] = "filled_input"
                    elif tag == "textarea":
                        await human_type(page, selector, str(value))
                        filled += 1
                        debug_entry["status"] = "filled_textarea"
                    else:
                        debug_entry["status"] = "unsupported_tag"

                    fill_debug.append(debug_entry)

                has_file_input = (
                    await page.query_selector("input[type='file']")
                ) is not None
                if has_file_input:
                    if resume_path is None:
                        fill_debug.append(
                            {
                                "selector": "input[type='file']",
                                "mapping": "resume_upload",
                                "resolved": None,
                                "status": "resume_missing",
                            }
                        )
                        logger.info(
                            "Greenhouse fill debug: %s",
                            json.dumps(fill_debug, ensure_ascii=False),
                        )
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error="Resume file not available for upload",
                        )

                    uploaded = await self._upload_resume(page, resume_path)
                    if not uploaded:
                        fill_debug.append(
                            {
                                "selector": "input[type='file']",
                                "mapping": "resume_upload",
                                "resolved": str(resume_path),
                                "status": "resume_upload_failed",
                            }
                        )
                        logger.info(
                            "Greenhouse fill debug: %s",
                            json.dumps(fill_debug, ensure_ascii=False),
                        )
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error="Resume upload failed",
                        )
                    filled += 1
                    fill_debug.append(
                        {
                            "selector": "input[type='file']",
                            "mapping": "resume_upload",
                            "resolved": str(resume_path),
                            "status": "uploaded_resume",
                        }
                    )

                logger.info(
                    "Greenhouse fill debug: %s",
                    json.dumps(fill_debug, ensure_ascii=False),
                )
                await random_pause(1.0, 2.0)

            if not auto_submit:
                from app.models.hitl import PENDING_SUBMIT_APPROVAL

                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=PENDING_SUBMIT_APPROVAL,
                )

            return await self._submit_application(
                page,
                initial_url=initial_url,
                field_mapping=field_mapping,
                filled=filled,
            )

        except Exception as e:
            logger.error("Greenhouse fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )

    async def submit_form(
        self,
        page: Page,
        *,
        fields_filled: int = 0,
        field_mapping: dict[str, str] | None = None,
    ) -> FillResult:
        """Submit a Greenhouse form that was already filled."""
        return await self._submit_application(
            page,
            initial_url=page.url,
            field_mapping=field_mapping or {},
            filled=fields_filled,
        )

    async def _submit_application(
        self,
        page: Page,
        *,
        initial_url: str,
        field_mapping: dict[str, str],
        filled: int,
    ) -> FillResult:
        try:
            submit_selector = (
                "form button[type='submit'], "
                "form input[type='submit'], "
                "form button:has-text('Submit application'), "
                "form button:has-text('Submit')"
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
                invalid_snapshot = await self._collect_invalid_field_snapshot(page)
                selector_snapshot = await self._collect_selector_snapshot(
                    page,
                    list(dict.fromkeys([*field_mapping.keys(), "input[type='file']"])),
                )
                logger.info(
                    "Greenhouse invalid field snapshot: %s",
                    json.dumps(invalid_snapshot, ensure_ascii=False),
                )
                logger.info(
                    "Greenhouse selector snapshot after failed submit: %s",
                    json.dumps(selector_snapshot, ensure_ascii=False),
                )
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

            invalid_snapshot = await self._collect_invalid_field_snapshot(page)
            selector_snapshot = await self._collect_selector_snapshot(
                page,
                list(dict.fromkeys([*field_mapping.keys(), "input[type='file']"])),
            )
            logger.info(
                "Greenhouse invalid field snapshot: %s",
                json.dumps(invalid_snapshot, ensure_ascii=False),
            )
            logger.info(
                "Greenhouse selector snapshot after failed submit: %s",
                json.dumps(selector_snapshot, ensure_ascii=False),
            )
            logger.info(
                "Greenhouse: submit did not reach confirmation after filling %d fields",
                filled,
            )
            if await self._awaiting_security_code(page):
                logger.warning(
                    "Greenhouse: board requires an emailed security code"
                )
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=(
                        "Greenhouse emailed a security code to the candidate; "
                        "enter it to finish the application"
                    ),
                )
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error="Submit did not reach a confirmation page",
            )
        except Exception as e:
            logger.error("Greenhouse submit failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
