"""Lever ATS handler.

Lever application pages are at ``jobs.lever.co/<company>/<id>/apply``
with a clean, single-page form. Job posting URLs omit ``/apply``; this
handler navigates to the form before extracting or filling fields.
"""

from __future__ import annotations

import json
import logging
import re
from difflib import SequenceMatcher
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.captcha import (
    ensure_captcha_cleared,
    get_hcaptcha_token,
    is_hcaptcha_challenge_visible,
    wait_for_hcaptcha_silent_pass,
)
from app.browser.dom import first_visible, safe_click
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.resume_upload import prepare_resume_file, upload_resume_to_file_inputs
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_SUCCESS_PATTERNS = (
    "thank you for applying",
    "application submitted",
    "thanks for applying",
    "we received your application",
)

_FORM_SELECTOR = "#application-form, .application-form, form#application"
_APPLY_LINK_SELECTOR = (
    'a[data-qa="show-page-apply"], a.postings-btn[href*="/apply"], a[href$="/apply"]'
)
_SUBMIT_SELECTOR = (
    '#btn-submit, [data-qa="btn-submit"], button:has-text("Submit application")'
)
_LOCATION_INPUT_SELECTORS = (
    "#location-input",
    "input#location-input",
    'input[name="location"]',
    'input[placeholder*="Location" i]',
    'input[data-qa="location"]',
)
_DEBUG_ROOT = Path(__file__).resolve().parents[2] / ".apply-debug"


class LeverHandler(ATSHandler):
    ats_name = "lever"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "lever.co" in url:
            return True
        lever_el = await page.query_selector(
            ".lever-application-form, .application-form, #application-form"
        )
        return lever_el is not None

    async def ensure_application_form(self, page: Page) -> None:
        """Navigate from a Lever posting page to the ``/apply`` form if needed."""
        if await page.query_selector(_FORM_SELECTOR):
            await page.wait_for_selector(_FORM_SELECTOR, timeout=15_000)
            return

        url = page.url
        parsed = urlparse(url)
        path = parsed.path.rstrip("/")

        if path.endswith("/apply"):
            await page.wait_for_selector(_FORM_SELECTOR, timeout=20_000)
            return

        apply_link = await page.query_selector(_APPLY_LINK_SELECTOR)
        if apply_link:
            logger.info("Lever: clicking apply link on posting page")
            await human_click(page, _APPLY_LINK_SELECTOR)
            try:
                await page.wait_for_selector(_FORM_SELECTOR, timeout=20_000)
                return
            except Exception:
                logger.warning("Lever: apply click did not reveal form; trying URL fallback")

        apply_path = f"{path}/apply"
        apply_url = urlunparse(
            (parsed.scheme, parsed.netloc, apply_path, "", parsed.query, "")
        )
        logger.info("Lever: navigating to apply URL %s", apply_url)
        await page.goto(apply_url, wait_until="domcontentloaded", timeout=45_000)
        await page.wait_for_selector(_FORM_SELECTOR, timeout=20_000)

    async def _get_option_text(self, page: Page, element) -> str:
        """Text of a single radio/checkbox option, not its question."""
        try:
            text = await element.evaluate(
                """el => {
                    const label = el.closest('label');
                    if (label) {
                        const span = label.querySelector(
                            '.application-answer-alternative, span'
                        );
                        const t = (span?.innerText || label.innerText || '').trim();
                        if (t) return t;
                    }
                    const row = el.closest('li');
                    if (row) {
                        const t = (row.innerText || '').trim();
                        if (t) return t;
                    }
                    const aria = el.getAttribute('aria-label');
                    if (aria) return aria.trim();
                    return (el.value || el.getAttribute('value') || '').trim();
                }"""
            )
        except Exception:
            return ""
        return " ".join(str(text).split())

    async def _get_question_label(self, page: Page, element) -> str:
        """Label of the whole question, not the individual option."""
        try:
            text = await element.evaluate(
                """el => {
                    const q = el.closest(
                        '.application-question, .custom-question, li, fieldset'
                    );
                    const l = q?.querySelector(
                        '.application-label, legend, h4, h3, .question-text'
                    );
                    return (l?.innerText || '').trim();
                }"""
            )
        except Exception:
            return ""
        return " ".join(str(text).split())

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

        # Lever often wraps controls in .application-question with a sibling label.
        question = await element.evaluate_handle(
            """el => el.closest('.application-question, .custom-question, li, .form-group, fieldset')"""
        )
        question_el = question.as_element() if question else None
        if question_el:
            for sel in ("label", ".application-label", "h4", "h3", ".question-text"):
                label_el = await question_el.query_selector(sel)
                if label_el:
                    text = (await label_el.inner_text()).strip()
                    if text:
                        return text

        return ""

    def _is_location_field(self, field_id: str, name: str, label: str) -> bool:
        blob = f"{field_id} {name} {label}".lower()
        return "location" in blob and "selected-location" not in blob

    async def extract_fields(self, page: Page) -> list[FormField]:
        await self.ensure_application_form(page)
        fields: list[FormField] = []
        seen: set[str] = set()

        inputs = await page.query_selector_all(
            ".application-form input[type='text'], "
            ".application-form input[type='email'], "
            ".application-form input[type='tel'], "
            ".application-form input[type='url'], "
            "#application-form input[type='text'], "
            "#application-form input[type='email'], "
            "#application-form input[type='tel'], "
            "#application-form input[type='url']"
        )
        for inp in inputs:
            inp_name = await inp.get_attribute("name") or ""
            inp_id = await inp.get_attribute("id") or ""
            if inp_id == "selected-location" or inp_name == "selected-location":
                continue
            if await inp.get_attribute("type") == "hidden":
                continue
            placeholder = await inp.get_attribute("placeholder") or ""
            label = await self._get_label_text(page, inp) or placeholder or inp_name or inp_id
            selector = f"#{inp_id}" if inp_id else f"input[name='{inp_name}']"
            if not inp_id and not inp_name:
                continue
            if selector in seen:
                continue
            required = (
                await inp.get_attribute("required") is not None
                or (await inp.get_attribute("aria-required")) == "true"
                or "*" in label
            )
            field_type = (
                "location" if self._is_location_field(inp_id, inp_name, label) else "text"
            )
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type=field_type,
                    required=required,
                )
            )
            seen.add(selector)

        textareas = await page.query_selector_all(
            ".application-form textarea, #application-form textarea"
        )
        for ta in textareas:
            ta_name = await ta.get_attribute("name") or ""
            ta_id = await ta.get_attribute("id") or ""
            if "captcha" in ta_name.lower() or "captcha" in ta_id.lower():
                continue
            if not ta_id and not ta_name:
                continue
            selector = f"#{ta_id}" if ta_id else f"textarea[name='{ta_name}']"
            if selector in seen:
                continue
            label = await self._get_label_text(page, ta) or ta_name or ta_id
            required = (
                await ta.get_attribute("required") is not None
                or (await ta.get_attribute("aria-required")) == "true"
                or "*" in label
            )
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type="textarea",
                    required=required,
                )
            )
            seen.add(selector)

        selects = await page.query_selector_all(
            ".application-form select, #application-form select"
        )
        for sel in selects:
            sel_id = await sel.get_attribute("id") or ""
            sel_name = await sel.get_attribute("name") or ""
            if not sel_id and not sel_name:
                continue
            selector = f"#{sel_id}" if sel_id else f"select[name='{sel_name}']"
            if selector in seen:
                continue
            options = []
            for opt in await sel.query_selector_all("option"):
                text = (await opt.inner_text()).strip()
                if text and text.lower() not in {"select...", "select", ""}:
                    options.append(text)
            label = await self._get_label_text(page, sel) or sel_name or sel_id
            required = (
                await sel.get_attribute("required") is not None
                or (await sel.get_attribute("aria-required")) == "true"
                or "*" in label
            )
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type="select",
                    required=required,
                    options=options,
                )
            )
            seen.add(selector)

        checkboxes = await page.query_selector_all(
            ".application-form input[type='checkbox'], "
            "#application-form input[type='checkbox']"
        )
        checkbox_groups: dict[str, list] = {}
        for cb in checkboxes:
            cb_name = await cb.get_attribute("name") or ""
            key = cb_name or (await cb.get_attribute("id") or "")
            if key:
                checkbox_groups.setdefault(key, []).append(cb)

        for key, group in checkbox_groups.items():
            selector = (
                f"input[name='{key}']"
                if key and not key.startswith("#")
                else f"#{key}"
            )
            if selector in seen:
                continue
            options = []
            if len(group) > 1:
                for cb in group:
                    text = await self._get_option_text(page, cb)
                    if text:
                        options.append(text)
            label = await self._get_label_text(page, group[0]) or key
            required = await group[0].get_attribute("required") is not None
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type="checkbox",
                    required=required,
                    options=options,
                )
            )
            seen.add(selector)

        radios = await page.query_selector_all(
            ".application-form input[type='radio'], "
            "#application-form input[type='radio']"
        )
        radio_groups: dict[str, list] = {}
        for radio in radios:
            radio_name = await radio.get_attribute("name") or ""
            if radio_name:
                radio_groups.setdefault(radio_name, []).append(radio)

        for radio_name, group in radio_groups.items():
            selector = f"input[name='{radio_name}']"
            if selector in seen:
                continue
            options = []
            for radio in group:
                text = await self._get_option_text(page, radio)
                if text:
                    options.append(text)
            question = await self._get_question_label(page, group[0])
            required = "*" in question or (
                await group[0].get_attribute("required") is not None
            )
            fields.append(
                FormField(
                    selector=selector,
                    label=question or radio_name,
                    field_type="radio",
                    required=required,
                    options=options,
                )
            )
            seen.add(selector)

        file_inputs = await page.query_selector_all(
            ".application-form input[type='file'], #application-form input[type='file']"
        )
        for fi in file_inputs:
            fi_name = await fi.get_attribute("name") or "resume"
            fi_id = await fi.get_attribute("id") or ""
            selector = f"#{fi_id}" if fi_id else f"input[name='{fi_name}']"
            if selector in seen:
                continue
            label = await self._get_label_text(page, fi) or fi_name
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type="file",
                    required=True,
                )
            )
            seen.add(selector)

        logger.info("Lever: extracted %d fields", len(fields))
        return fields

    async def _location_already_selected(self, page: Page) -> str:
        hidden = await page.query_selector("#selected-location")
        if hidden is None:
            return ""
        raw = (await hidden.get_attribute("value") or "").strip()
        if not raw:
            return ""
        # Resume auto-parse sometimes leaves a placeholder JSON object.
        if raw in {'{"name":""}', "{}", "null", "undefined"}:
            return ""
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                name = (parsed.get("name") or parsed.get("label") or "").strip()
                if not name and not parsed.get("id"):
                    return ""
                return name or raw
        except Exception:
            pass
        return raw

    async def _fill_location(self, page: Page, selector: str, value: str) -> bool:
        """Type into Lever's location autocomplete and pick a suggestion.

        Location focus triggers ``hcaptcha.execute``. Prefer stealth silent-pass;
        CapSolver only if a visible challenge blocks and no token appears.
        Resume auto-parse may already set ``#selected-location``.
        """
        existing = await self._location_already_selected(page)
        if existing:
            logger.info("Lever: location already selected (%r)", existing)
            return True

        field = await page.query_selector(selector)
        if field is None:
            for loc_sel in _LOCATION_INPUT_SELECTORS:
                field = await page.query_selector(loc_sel)
                if field is not None:
                    selector = loc_sel
                    break
        if field is None:
            return False

        # Focus triggers invisible hCaptcha — wait for silent-pass before typing.
        try:
            await safe_click(field, timeout=5_000)
        except Exception:
            await safe_click(field, force=True)

        await wait_for_hcaptcha_silent_pass(page, timeout_ms=12_000)

        if await is_hcaptcha_challenge_visible(page) and not await get_hcaptcha_token(
            page
        ):
            logger.info("Lever: location focus showed challenge; CapSolver fallback")
            captcha_error = await ensure_captcha_cleared(
                    page, silent_timeout_ms=3_000
            )
            if captcha_error:
                logger.warning("Lever: captcha after location focus: %s", captcha_error)
            await page.evaluate(
                """() => {
                    const root = document.getElementById('h-captcha');
                    if (root) root.style.pointerEvents = 'none';
                }"""
            )

        await safe_click(field, force=True)
        await random_pause(0.3, 0.6)
        await page.keyboard.press("Meta+A")
        await page.keyboard.press("Backspace")
        await page.keyboard.type(value, delay=60)
        await random_pause(1.5, 2.5)

        # Wait for Lever dropdown results (retrieveLocations.js).
        try:
            await page.wait_for_selector(
                ".dropdown-results .dropdown-location, "
                ".dropdown-results > div, "
                ".dropdown-container:not([style*='display: none']) .dropdown-results > *",
                timeout=8_000,
                state="visible",
            )
        except Exception:
            no_results = await page.query_selector(
                ".dropdown-no-results:not([style*='display: none'])"
            )
            if no_results:
                logger.warning("Lever: location dropdown shows no results for %r", value)

        suggestion_selectors = [
            ".dropdown-results .dropdown-location",
            ".dropdown-results > div",
            ".dropdown-results .dropdown-location-active",
            ".dropdown-results li",
            "[role='option']",
        ]
        for sug_sel in suggestion_selectors:
            suggestion = await page.query_selector(sug_sel)
            if suggestion and await suggestion.is_visible():
                await safe_click(suggestion, force=True)
                await random_pause(0.3, 0.6)
                if await self._location_already_selected(page):
                    return True
                return True

        # Last resort: set hidden selectedLocation (Lever validates this on submit).
        location_payload = value
        if not value.strip().startswith("{"):
            location_payload = json.dumps({"name": value})
        await page.evaluate(
            """(val) => {
                const hidden = document.getElementById('selected-location');
                const input = document.getElementById('location-input');
                let display = val;
                try {
                    const parsed = JSON.parse(val);
                    if (parsed && parsed.name) display = parsed.name;
                } catch (e) {}
                if (hidden) {
                    hidden.value = val;
                    hidden.dispatchEvent(new Event('input', { bubbles: true }));
                    hidden.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (input) {
                    input.value = display;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }""",
            location_payload,
        )
        if await self._location_already_selected(page):
            logger.warning(
                "Lever: forced selected-location=%r without dropdown click", value
            )
            return True
        return False

    async def _fill_select(self, page: Page, selector: str, value: str) -> bool:
        field = await page.query_selector(selector)
        if field is None:
            return False
        options = await field.query_selector_all("option")
        target = value.strip().lower()
        for opt in options:
            text = (await opt.inner_text()).strip()
            opt_value = (await opt.get_attribute("value") or "").strip()
            if text.lower() == target or opt_value.lower() == target:
                await page.select_option(selector, label=text)
                return True
        for opt in options:
            text = (await opt.inner_text()).strip()
            if target and target in text.lower():
                await page.select_option(selector, label=text)
                return True
        # Prefer first real option when LLM returned a vague answer for required selects.
        for opt in options:
            text = (await opt.inner_text()).strip()
            opt_value = (await opt.get_attribute("value") or "").strip()
            if text and text.lower() not in {"select...", "select", ""} and opt_value:
                await page.select_option(selector, value=opt_value)
                logger.info("Lever: select %s fell back to option %r", selector, text)
                return True
        return False

    async def _check_element(self, page: Page, element) -> bool:
        """Check a radio/checkbox, falling back to its label or a JS click."""
        try:
            if await element.is_visible():
                await element.check(timeout=3_000)
                return True
        except Exception:
            pass

        try:
            label_handle = await element.evaluate_handle(
                "el => el.closest('label')"
            )
            label_el = label_handle.as_element()
            if label_el is not None and await label_el.is_visible():
                await label_el.click(timeout=3_000)
                return True
        except Exception:
            pass

        try:
            await element.evaluate("el => el.click()")
            return True
        except Exception:
            return False

    async def _fill_checkbox(self, page: Page, selector: str, value: str) -> bool:
        truthy = {"1", "true", "yes", "y", "on", "checked"}
        target = str(value).strip().lower()
        elements = await page.query_selector_all(selector)
        if not elements:
            return False

        # A lone checkbox is a boolean; a same-name group is a multi-select.
        if len(elements) == 1 and target in truthy:
            return await self._check_element(page, elements[0])

        for element in elements:
            text = (await self._get_option_text(page, element)).strip().lower()
            raw = (await element.get_attribute("value") or "").strip().lower()
            if target and (
                target == text
                or target == raw
                or (text and target in text)
                or (raw and target in raw)
            ):
                return await self._check_element(page, element)

        if len(elements) == 1:
            # Allow matching by the question label (pronouns, consent).
            label = await self._get_label_text(page, elements[0])
            if target and target in label.strip().lower():
                return await self._check_element(page, elements[0])

        logger.warning("Lever: no checkbox option matched %r for %s", value, selector)
        return False

    async def _fill_radio(self, page: Page, selector: str, value: str) -> bool:
        elements = await page.query_selector_all(selector)
        target = value.strip().lower()
        if not target or not elements:
            return False

        best = None
        best_score = 0.0
        for element in elements:
            text = (await self._get_option_text(page, element)).strip().lower()
            raw = (await element.get_attribute("value") or "").strip().lower()
            if target and (
                target == text
                or target == raw
                or (text and target in text)
                or (raw and target in raw)
            ):
                best, best_score = element, 1.0
                break
            score = max(
                SequenceMatcher(None, target, text).ratio(),
                SequenceMatcher(None, target, raw).ratio() if raw else 0.0,
            )
            if score > best_score:
                best, best_score = element, score

        if best is None or best_score < 0.6:
            logger.warning(
                "Lever: no radio option matched %r for %s", value, selector
            )
            return False

        return await self._check_element(page, best)

    async def _dump_debug(
        self,
        page: Page,
        *,
        error: str,
        fields_filled: int = 0,
        field_count: int | None = None,
        mapping_size: int | None = None,
        job_id: str | None = None,
    ) -> None:
        try:
            slug = job_id or re.sub(r"[^a-zA-Z0-9_-]+", "_", page.url)[-80:]
            out_dir = _DEBUG_ROOT / slug
            out_dir.mkdir(parents=True, exist_ok=True)
            png_path = out_dir / "page.png"
            html_path = out_dir / "page.html"
            meta_path = out_dir / "meta.json"
            await page.screenshot(path=str(png_path), full_page=True)
            html_path.write_text(await page.content(), encoding="utf-8")
            meta_path.write_text(
                json.dumps(
                    {
                        "url": page.url,
                        "error": error,
                        "fields_filled": fields_filled,
                        "field_count": field_count,
                        "mapping_size": mapping_size,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            logger.error("Lever debug dump written to %s", out_dir)
        except Exception as dump_exc:
            logger.error("Lever debug dump failed: %s", dump_exc)

    async def _is_submission_successful(self, page: Page, initial_url: str) -> bool:
        content = (await page.content()).lower()
        if any(pattern in content for pattern in _SUCCESS_PATTERNS):
            return True
        if page.url != initial_url and "thanks" in page.url.lower():
            return True
        confirmation = await page.query_selector(
            ".application-confirmation, .posting-thanks, [data-qa='application-confirmation']"
        )
        return confirmation is not None

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        try:
            await self.ensure_application_form(page)
        except Exception as e:
            await self._dump_debug(
                page,
                error=f"Lever application form not found: {e}",
                mapping_size=len(field_mapping),
            )
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=0,
                error=f"Lever application form not found: {e}",
            )

        initial_url = page.url
        try:
            async with prepare_resume_file(cv_data) as resume_path:
                has_file_input = (
                    await page.query_selector(
                        ".application-form input[type='file'], "
                        "#application-form input[type='file'], "
                        "input[type='file']"
                    )
                ) is not None

                if has_file_input:
                    if resume_path is None:
                        err = "Resume file not available for upload"
                        await self._dump_debug(
                            page, error=err, mapping_size=len(field_mapping)
                        )
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error=err,
                        )
                    uploaded = await upload_resume_to_file_inputs(page, resume_path)
                    if not uploaded:
                        err = "Failed to attach resume to Lever file input"
                        await self._dump_debug(
                            page, error=err, mapping_size=len(field_mapping)
                        )
                        return FillResult(
                            success=False,
                            ats_type=self.ats_name,
                            fields_filled=filled,
                            error=err,
                        )
                    filled += 1
                    logger.info("Lever: resume uploaded from %s", resume_path)
                    # Resume parse may auto-fill name/email/location; give Lever a beat.
                    await random_pause(2.0, 3.5)

                # Prefer location from mapping or cv_data.location.
                # Captcha: stealth silent-pass during location/submit; CapSolver only if challenged.
                for selector, cv_key in list(field_mapping.items()):
                    value = resolve_mapped_value(cv_data, cv_key)
                    if value is None:
                        continue
                    field_el = await first_visible(page, selector)
                    if field_el is None:
                        continue

                    tag = (await field_el.evaluate("el => el.tagName")).lower()
                    input_type = (await field_el.get_attribute("type") or "").lower()
                    if input_type == "file":
                        continue

                    label = await self._get_label_text(page, field_el)
                    field_id = await field_el.get_attribute("id") or ""
                    field_name = await field_el.get_attribute("name") or ""

                    if tag == "select":
                        ok = await self._fill_select(page, selector, str(value))
                        if ok:
                            filled += 1
                        else:
                            logger.warning(
                                "Lever: failed to fill select %s with %r",
                                selector,
                                value,
                            )
                        continue

                    if input_type == "checkbox":
                        if await self._fill_checkbox(page, selector, str(value)):
                            filled += 1
                        continue

                    if input_type == "radio":
                        if await self._fill_radio(page, selector, str(value)):
                            filled += 1
                        else:
                            logger.warning(
                                "Lever: failed to fill radio %s with %r",
                                selector,
                                value,
                            )
                        continue

                    if self._is_location_field(field_id, field_name, label):
                        ok = await self._fill_location(page, selector, str(value))
                        if not ok:
                            err = f"Lever location autocomplete failed for {value!r}"
                            await self._dump_debug(
                                page,
                                error=err,
                                fields_filled=filled,
                                mapping_size=len(field_mapping),
                            )
                            return FillResult(
                                success=False,
                                ats_type=self.ats_name,
                                fields_filled=filled,
                                error=err,
                            )
                        filled += 1
                        continue

                    await human_type(page, selector, str(value))
                    filled += 1

                # Fill location from CV if present but unmapped.
                if cv_data.location:
                    loc_already = False
                    for sel in _LOCATION_INPUT_SELECTORS:
                        el = await page.query_selector(sel)
                        if el is None:
                            continue
                        current = (await el.input_value()).strip()
                        if current:
                            loc_already = True
                            break
                    if not loc_already:
                        for sel in _LOCATION_INPUT_SELECTORS:
                            if await page.query_selector(sel):
                                ok = await self._fill_location(
                                    page, sel, cv_data.location
                                )
                                if ok:
                                    filled += 1
                                else:
                                    err = (
                                        "Lever location autocomplete failed for "
                                        f"{cv_data.location!r}"
                                    )
                                    await self._dump_debug(
                                        page,
                                        error=err,
                                        fields_filled=filled,
                                        mapping_size=len(field_mapping),
                                    )
                                    return FillResult(
                                        success=False,
                                        ats_type=self.ats_name,
                                        fields_filled=filled,
                                        error=err,
                                    )
                                break

                await random_pause(1.0, 2.0)

                # Invisible hCaptcha only resolves on submit; never gate before it runs.
                captcha_error = None
                if captcha_error:
                    await self._dump_debug(
                        page,
                        error=captcha_error,
                        fields_filled=filled,
                        mapping_size=len(field_mapping),
                    )
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=captcha_error,
                    )

                submit_btn = await page.query_selector(_SUBMIT_SELECTOR)
                if not submit_btn:
                    err = "Lever submit button not found"
                    await self._dump_debug(
                        page,
                        error=err,
                        fields_filled=filled,
                        mapping_size=len(field_mapping),
                    )
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=err,
                    )

                await page.evaluate(
                    """() => {
                        const root = document.getElementById('h-captcha');
                        if (root) root.style.pointerEvents = 'none';
                    }"""
                )
                await random_pause(0.2, 0.5)
                await safe_click(page.locator(_SUBMIT_SELECTOR).first, force=True)

                # Lever submit may trigger hcaptcha.execute → wait for silent-pass + navigation.
                await wait_for_hcaptcha_silent_pass(page, timeout_ms=15_000)
                try:
                    await page.wait_for_load_state("networkidle", timeout=20_000)
                except Exception:
                    await random_pause(2.0, 3.0)

                if not await self._is_submission_successful(page, initial_url):
                    # No token after submit means the widget ran and failed.
                    if (
                        not await get_hcaptcha_token(page)
                        or await is_hcaptcha_challenge_visible(page)
                    ):
                        post_captcha = await ensure_captcha_cleared(
                            page, silent_timeout_ms=15_000
                        )
                        if post_captcha:
                            await self._dump_debug(
                                page,
                                error=post_captcha,
                                fields_filled=filled,
                                mapping_size=len(field_mapping),
                            )
                            return FillResult(
                                success=False,
                                ats_type=self.ats_name,
                                fields_filled=filled,
                                error=post_captcha,
                            )
                    if await page.query_selector(_SUBMIT_SELECTOR):
                        await safe_click(page.locator(_SUBMIT_SELECTOR).first, force=True)
                        await wait_for_hcaptcha_silent_pass(page, timeout_ms=15_000)
                        try:
                            await page.wait_for_load_state(
                                "networkidle", timeout=20_000
                            )
                        except Exception:
                            await random_pause(2.0, 3.0)

                if not await self._is_submission_successful(page, initial_url):
                    err = "Lever submit did not show a confirmation"
                    await self._dump_debug(
                        page,
                        error=err,
                        fields_filled=filled,
                        mapping_size=len(field_mapping),
                    )
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=err,
                    )

                logger.info("Lever: filled %d fields and submitted", filled)
                return FillResult(
                    success=True, ats_type=self.ats_name, fields_filled=filled
                )

        except Exception as e:
            logger.error("Lever fill failed: %s", e)
            await self._dump_debug(
                page,
                error=str(e),
                fields_filled=filled,
                mapping_size=len(field_mapping),
            )
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
