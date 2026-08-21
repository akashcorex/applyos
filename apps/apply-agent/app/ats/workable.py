"""Workable ATS handler.

Workable boards live at ``apply.workable.com/<company>/j/<shortcode>``
(or ``apply.workable.com/j/<shortcode>``). The application form is at
the same path with ``/apply`` appended, and also via the Application tab.

Form controls expose stable ``name`` / ``data-ui`` attributes matching
field ids from ``/api/v1/jobs/{shortcode}/form`` (e.g. ``firstname``,
``resume``, ``QA_*``).
"""

from __future__ import annotations

import asyncio
import logging
import re
from datetime import datetime
from urllib.parse import urlparse, urlunparse

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.captcha import detect_turnstile, ensure_captcha_cleared
from app.browser.human_delay import human_click, random_pause
from app.browser.resume_upload import prepare_resume_file
from app.config import settings
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_FORM_SELECTOR = "[data-ui='application-form'], form[data-ui='application-form']"
_IDENTITY_SELECTOR = (
    "input[name='firstname'], input#firstname, [data-ui='firstname'] input"
)
_SUBMIT_SELECTOR = (
    "[data-ui='apply-button'], "
    "button:has-text('Submit application'), "
    "button[type='submit']:has-text('Submit')"
)
_APPLICATION_TAB_SELECTOR = (
    "[data-ui='application-form-tab'], "
    "button:has-text('Application'), "
    "a:has-text('Application'), "
    "[role='tab']:has-text('Application')"
)
_APPLY_NOW_SELECTOR = (
    "[data-ui='overview-apply-now'], "
    "[data-ui='sticky-apply-now'], "
    "button:has-text('Apply now'), "
    "a:has-text('Apply now')"
)
_COOKIE_ACCEPT_SELECTOR = (
    "[data-ui='cookie-consent-accept'], "
    "button:has-text('Accept all')"
)
_SUCCESS_SELECTOR = (
    "[data-ui='successful-submit'], "
    ".application-confirmation, "
    "[class*='successful-submit']"
)
# Strong confirmation phrases from Workable's post-submit "Thank you!" page.
_SUCCESS_PATTERNS = (
    "your application has been submitted successfully",
    "thank you!",
)
_SUCCESS_SECONDARY = (
    "would you like to update your profile",
    "no, skip",
    "yes, update",
)


def _is_workable_submit_response(response) -> bool:
    """True for Workable application submit APIs — not resume S3 uploads."""
    try:
        method = response.request.method.upper()
        if method not in {"POST", "PUT", "PATCH"}:
            return False
        url = response.url.lower()
        if not (200 <= response.status < 300):
            return False
        # Resume uploads go to S3 on submit — not a successful application.
        if "amazonaws.com" in url or "application-form.s3" in url:
            return False
        if "workable.com" not in url:
            return False
        if any(
            token in url
            for token in (
                "/api/v1/jobs",
                "/api/v3/",
                "candidates",
                "applications",
                "/apply",
            )
        ):
            return True
        return False
    except Exception:
        return False

class WorkableHandler(ATSHandler):
    ats_name = "workable"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "workable.com" in url or "apply.workable.com" in url:
            return True
        form = await page.query_selector(_FORM_SELECTOR)
        return form is not None

    async def _dismiss_cookie_banner(self, page: Page) -> None:
        btn = await page.query_selector(_COOKIE_ACCEPT_SELECTOR)
        if btn is None:
            return
        try:
            await page.locator(_COOKIE_ACCEPT_SELECTOR).first.click(force=True)
            await random_pause(0.2, 0.5)
        except Exception:
            logger.debug("Workable: cookie banner dismiss skipped", exc_info=True)

    async def ensure_application_form(self, page: Page) -> None:
        """Navigate from a job posting to the application form if needed.

        Supports:
        - ``apply.workable.com/.../j/{shortcode}`` → ``/apply`` or Application tab
        - ``jobs.workable.com/view/...`` → click ``Apply now`` (form opens in-page)
        """
        await self._dismiss_cookie_banner(page)

        if await page.query_selector(_IDENTITY_SELECTOR):
            await page.wait_for_selector(_FORM_SELECTOR, timeout=15_000)
            return

        parsed = urlparse(page.url)
        host = (parsed.netloc or "").lower().removeprefix("www.")
        path = parsed.path.rstrip("/")

        # Jobs By Workable marketplace job pages.
        if "jobs.workable.com" in host and "/view/" in path:
            logger.info("Workable: opening apply form on jobs.workable.com view")
            apply_loc = page.locator(
                "[data-ui='overview-apply-now'], [data-ui='sticky-apply-now']"
            ).first
            try:
                await apply_loc.wait_for(state="visible", timeout=15_000)
            except Exception as error:
                raise TimeoutError(
                    "Workable Apply now button not found on jobs.workable.com view page"
                ) from error
            await self._dismiss_cookie_banner(page)
            try:
                await apply_loc.click(timeout=5_000)
            except Exception:
                await apply_loc.click(force=True)
            await page.wait_for_selector(_IDENTITY_SELECTOR, timeout=20_000)
            await self._dismiss_cookie_banner(page)
            return

        if path.endswith("/apply"):
            await page.wait_for_selector(_IDENTITY_SELECTOR, timeout=20_000)
            await self._dismiss_cookie_banner(page)
            return

        tab = await page.query_selector(_APPLICATION_TAB_SELECTOR)
        if tab:
            logger.info("Workable: clicking Application tab")
            await human_click(page, _APPLICATION_TAB_SELECTOR)
            try:
                await page.wait_for_selector(_IDENTITY_SELECTOR, timeout=15_000)
                await self._dismiss_cookie_banner(page)
                return
            except Exception:
                logger.warning(
                    "Workable: Application tab did not reveal form; trying URL"
                )

        apply_now = await page.query_selector(_APPLY_NOW_SELECTOR)
        if apply_now:
            logger.info("Workable: clicking Apply now")
            try:
                await human_click(page, _APPLY_NOW_SELECTOR)
            except Exception:
                await page.locator(_APPLY_NOW_SELECTOR).first.click(force=True)
            try:
                await page.wait_for_selector(_IDENTITY_SELECTOR, timeout=15_000)
                await self._dismiss_cookie_banner(page)
                return
            except Exception:
                logger.warning("Workable: Apply now did not reveal form; trying /apply")

        apply_path = f"{path}/apply"
        apply_url = urlunparse(
            (parsed.scheme, parsed.netloc, apply_path, "", parsed.query, "")
        )
        logger.info("Workable: navigating to apply URL %s", apply_url)
        await page.goto(apply_url, wait_until="domcontentloaded", timeout=45_000)
        await page.wait_for_selector(_IDENTITY_SELECTOR, timeout=20_000)
        await self._dismiss_cookie_banner(page)

    def _field_selector(self, *, element_id: str, name: str, data_ui: str, tag: str) -> str:
        if data_ui and tag == "input" and data_ui not in {"option"}:
            # Prefer the control itself when data-ui is on the input.
            return f"input[data-ui='{data_ui}']"
        if data_ui and tag == "textarea":
            return f"textarea[data-ui='{data_ui}']"
        if element_id and not element_id.startswith("input_files_input_"):
            escaped = element_id.replace("\\", "\\\\").replace('"', '\\"')
            return f'[id="{escaped}"]'
        if name:
            escaped = name.replace("\\", "\\\\").replace("'", "\\'")
            return f"{tag}[name='{escaped}']"
        if data_ui:
            return f"[data-ui='{data_ui}']"
        return ""

    def _clean_label(self, text: str) -> str:
        cleaned = re.sub(r"\s+", " ", (text or "").strip())
        cleaned = cleaned.lstrip("* ").strip()
        # Drop trailing optional markers / file-picker CTA noise.
        cleaned = re.sub(
            r"\s*\(Optional\)\s*$", "", cleaned, flags=re.IGNORECASE
        )
        cleaned = re.sub(
            r"\s*Choose file.*$", "", cleaned, flags=re.IGNORECASE
        ).strip()
        return cleaned

    def _is_noise_label(self, text: str) -> bool:
        lowered = text.strip().lower()
        if not lowered:
            return True
        if lowered in {
            "choose file",
            "yes",
            "no",
            "optional",
            "or drag and drop here",
        }:
            return True
        # intl-tel-input country names / dial codes
        if re.fullmatch(r"\+\d+", lowered):
            return True
        if lowered in {
            "united states",
            "united kingdom",
            "india",
            "canada",
            "australia",
            "germany",
            "france",
        }:
            return True
        return False

    async def _get_label_text(self, page: Page, element) -> str:
        name = await element.get_attribute("name") or ""
        data_ui = await element.get_attribute("data-ui") or ""
        if name == "phone" or data_ui == "phone":
            return "Phone"
        if data_ui == "resume" or name == "resume":
            return "Resume"
        if name in {
            "firstname",
            "lastname",
            "email",
            "summary",
            "cover_letter",
            "headline",
            "address",
        }:
            pretty = {
                "firstname": "First name",
                "lastname": "Last name",
                "email": "Email",
                "summary": "Summary",
                "cover_letter": "Cover letter",
                "headline": "Headline",
                "address": "Address",
            }
            return pretty[name]

        field_id = await element.get_attribute("id") or ""
        if field_id:
            label_el = await page.query_selector(f'label[for="{field_id}"]')
            if label_el:
                text = self._clean_label(await label_el.inner_text())
                if text and not self._is_noise_label(text):
                    return text

        # Workable custom questions expose `${id}_label` nodes.
        for key in (data_ui, name):
            if not key:
                continue
            label_el = await page.query_selector(f'[id="{key}_label"]')
            if label_el:
                text = self._clean_label(await label_el.inner_text())
                if text and not self._is_noise_label(text):
                    return text

        # Many Workable inputs are wrapped in a parent <label>.
        parent_label = await element.evaluate(
            """el => {
              const label = el.closest('label');
              return (label?.innerText || '').replace(/\\s+/g, ' ').trim();
            }"""
        )
        if parent_label:
            text = self._clean_label(str(parent_label))
            if text and not self._is_noise_label(text):
                return text

        # Workable often puts the question label on a sibling with id *_label,
        # referenced via the field wrapper's aria-labelledby.
        wrapper_label = await element.evaluate(
            """el => {
              const wrap = el.closest('fieldset, [role=radiogroup], [data-role], div');
              if (!wrap) return '';
              const aria = wrap.getAttribute('aria-labelledby') || '';
              const parts = [];
              for (const id of aria.split(/\\s+/).filter(Boolean)) {
                const node = document.getElementById(id);
                const t = (node?.innerText || '').replace(/\\s+/g, ' ').trim();
                if (t) parts.push(t);
              }
              if (parts.length) return parts.join(' ');
              const labelNode = wrap.querySelector('[id$="_label"], legend');
              return (labelNode?.innerText || '').replace(/\\s+/g, ' ').trim();
            }"""
        )
        if wrapper_label:
            text = self._clean_label(str(wrapper_label))
            if text and not self._is_noise_label(text):
                return text

        aria_label = await element.get_attribute("aria-label")
        if aria_label and aria_label.strip() and not self._is_noise_label(aria_label):
            return self._clean_label(aria_label)

        labelled_by = await element.get_attribute("aria-labelledby")
        if labelled_by:
            parts: list[str] = []
            for label_id in labelled_by.split():
                label_el = await page.query_selector(f'[id="{label_id}"]')
                if label_el:
                    text = self._clean_label(await label_el.inner_text())
                    if text and not self._is_noise_label(text):
                        parts.append(text)
            if parts:
                return " ".join(parts)

        return (data_ui or name or field_id).strip()

    async def _extract_radio_groups(self, page: Page) -> list[FormField]:
        groups = await page.evaluate(
            """() => {
              const byName = {};
              for (const r of document.querySelectorAll(
                '[data-ui="application-form"] input[type=radio]'
              )) {
                const name = r.name || '';
                if (!name) continue;
                (byName[name] ||= { options: [], label: '', required: false });
                if (r.required || r.getAttribute('aria-required') === 'true') {
                  byName[name].required = true;
                }
                const lab = document.querySelector(`label[for="${CSS.escape(r.id)}"]`)
                  || r.closest('label');
                const text = (lab?.innerText || r.value || '').replace(/\\s+/g, ' ').trim();
                if (text && !byName[name].options.includes(text)) {
                  byName[name].options.push(text);
                }
                if (!byName[name].label) {
                  const fieldset = r.closest('fieldset,[role=radiogroup]');
                  const legend = fieldset?.querySelector(
                    'legend, [id$="_label"], label'
                  );
                  let label = (legend?.innerText || '').replace(/\\s+/g, ' ').trim();
                  // Prefer the question text, not YES/NO option labels.
                  if (!label || /^(yes|no)$/i.test(label)) {
                    label = fieldset?.getAttribute('data-ui') || name;
                    const aria = fieldset?.getAttribute('aria-labelledby');
                    if (aria) {
                      const parts = aria.split(/\\s+/).map(id =>
                        document.getElementById(id)?.innerText || ''
                      ).join(' ').replace(/\\s+/g, ' ').trim();
                      if (parts && !/^(yes|no)$/i.test(parts)) label = parts;
                    }
                  }
                  byName[name].label = label;
                }
              }
              return Object.entries(byName).map(([name, meta]) => ({
                name,
                label: meta.label || name,
                options: meta.options,
                required: meta.required,
              }));
            }"""
        )
        fields: list[FormField] = []
        for group in groups:
            options = group.get("options") or []
            if len(options) < 2:
                continue
            name = group["name"]
            fields.append(
                FormField(
                    selector=f"workable-radio:{name}",
                    label=group.get("label") or name,
                    field_type="radio",
                    required=bool(group.get("required")),
                    options=options,
                )
            )
        return fields

    async def _extract_select_fields(self, page: Page) -> list[FormField]:
        """Workable custom selects: readonly combobox + hidden value input."""
        metas = await page.evaluate(
            """() => {
              return [...document.querySelectorAll(
                '[data-ui="application-form"] [data-input-type="select"]'
              )].map(wrap => {
                const dataUi = wrap.getAttribute('data-ui') || '';
                const labelEl = document.getElementById(`${dataUi}_label`)
                  || wrap.querySelector('label');
                const label = (labelEl?.innerText || dataUi)
                  .replace(/\\s+/g, ' ').trim();
                const hidden = wrap.querySelector('input[type="hidden"], input.styles__hidden-input--3eBMS, input[name]');
                const required = Boolean(
                  hidden?.required
                  || hidden?.getAttribute('aria-required') === 'true'
                  || (label || '').includes('*')
                );
                return { dataUi, label, required, name: hidden?.name || dataUi };
              }).filter(m => m.dataUi);
            }"""
        )
        fields: list[FormField] = []
        for meta in metas:
            data_ui = meta["dataUi"]
            options = await self._read_select_options(page, data_ui)
            fields.append(
                FormField(
                    selector=f"workable-select:{data_ui}",
                    label=self._clean_label(meta.get("label") or data_ui),
                    field_type="select",
                    required=bool(meta.get("required")),
                    options=options or None,
                )
            )
        return fields

    async def _read_select_options(
        self, page: Page, data_ui: str, *, limit: int = 80
    ) -> list[str]:
        wrap = page.locator(
            f'[data-ui="{data_ui}"][data-input-type="select"]'
        ).first
        if await wrap.count() == 0:
            return []
        combobox = wrap.locator("input[role='combobox']").first
        try:
            await combobox.click(force=True)
            await random_pause(0.2, 0.4)
            listbox_id = await combobox.get_attribute("aria-controls")
            option_sel = (
                f'[id="{listbox_id}"] [role="option"]'
                if listbox_id
                else f'[data-ui="{data_ui}"] [role="option"]'
            )
            texts = await page.evaluate(
                """({ optionSel, limit }) => {
                  const opts = [...document.querySelectorAll(optionSel)]
                    .map(o => (o.innerText || '').replace(/\\s+/g, ' ').trim())
                    .filter(Boolean);
                  // Prefer country-name spans when present (iti-like markup).
                  if (!opts.length) return [];
                  return [...new Set(opts)].slice(0, limit);
                }""",
                {"optionSel": option_sel, "limit": limit},
            )
            return list(texts or [])
        except Exception:
            logger.debug(
                "Workable: could not read options for %s", data_ui, exc_info=True
            )
            return []
        finally:
            await self._dismiss_overlays(page)
            # Click away to close listbox without Escape (Escape closes apply panel).
            try:
                await page.locator(_FORM_SELECTOR).first.click(force=True, timeout=1_000)
            except Exception:
                pass

    async def _fill_select(self, page: Page, data_ui: str, value: str) -> bool:
        choice = str(value).strip()
        if choice.lower().startswith("literal:"):
            choice = choice.split(":", 1)[1].strip()
        if not choice:
            return False

        await self._dismiss_overlays(page)
        wrap = page.locator(
            f'[data-ui="{data_ui}"][data-input-type="select"]'
        ).first
        if await wrap.count() == 0:
            return False

        combobox = wrap.locator("input[role='combobox']").first
        try:
            await combobox.click(force=True)
        except Exception:
            logger.warning("Workable: could not open select %s", data_ui)
            return False

        await random_pause(0.25, 0.5)
        listbox_id = await combobox.get_attribute("aria-controls")
        option_sel = (
            f'[id="{listbox_id}"] [role="option"]'
            if listbox_id
            else f'[data-ui="{data_ui}"] [role="option"]'
        )

        clicked = await page.evaluate(
            """({ optionSel, choice }) => {
              const norm = s => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const want = norm(choice);
              const options = [...document.querySelectorAll(optionSel)];
              const score = (text) => {
                const t = norm(text);
                if (t === want) return 3;
                if (t.startsWith(want) || want.startsWith(t)) return 2;
                if (t.includes(want) || want.includes(t)) return 1;
                return 0;
              };
              let best = null;
              let bestScore = 0;
              for (const opt of options) {
                const text = opt.innerText || '';
                const s = score(text);
                if (s > bestScore) {
                  bestScore = s;
                  best = opt;
                }
              }
              if (!best || bestScore === 0) {
                // Fall back to first real option.
                best = options.find(o => (o.innerText || '').trim()) || null;
              }
              if (!best) return false;
              best.scrollIntoView({ block: 'center' });
              best.click();
              return true;
            }""",
            {"optionSel": option_sel, "choice": choice},
        )
        await random_pause(0.2, 0.4)
        await self._dismiss_overlays(page)
        if clicked:
            logger.info("Workable: selected %s -> %s", data_ui, choice[:60])
        else:
            logger.warning("Workable: no option matched for %s=%r", data_ui, choice)
        return bool(clicked)

    async def extract_fields(self, page: Page) -> list[FormField]:
        await self.ensure_application_form(page)
        fields: list[FormField] = []
        seen: set[str] = set()

        for field in await self._extract_select_fields(page):
            seen.add(field.selector)
            # Also mark underlying combobox/hidden inputs as seen.
            data_ui = field.selector[len("workable-select:") :]
            seen.add(f"input[name='{data_ui}']")
            seen.add(f"[data-ui='{data_ui}']")
            fields.append(field)

        inputs = await page.query_selector_all(
            "[data-ui='application-form'] input[type='text'], "
            "[data-ui='application-form'] input[type='email'], "
            "[data-ui='application-form'] input[type='tel'], "
            "[data-ui='application-form'] input[type='url'], "
            "[data-ui='application-form'] input[type='number'], "
            "[data-ui='application-form'] input:not([type])"
        )
        for inp in inputs:
            if await inp.get_attribute("type") == "hidden":
                continue
            # Skip Workable custom selects (readonly comboboxes).
            readonly = await inp.get_attribute("readonly")
            role = (await inp.get_attribute("role") or "").lower()
            if readonly is not None or role == "combobox":
                continue
            in_select = await inp.evaluate(
                """el => Boolean(el.closest('[data-input-type="select"]'))"""
            )
            if in_select:
                continue

            inp_id = await inp.get_attribute("id") or ""
            inp_name = await inp.get_attribute("name") or ""
            data_ui = await inp.get_attribute("data-ui") or ""
            # Phone number lives inside [data-ui=phone] wrapper without data-ui on input.
            if not data_ui and inp_name == "phone":
                data_ui = "phone"
            label = await self._get_label_text(page, inp)
            if not label and not inp_name:
                continue
            selector = self._field_selector(
                element_id=inp_id, name=inp_name, data_ui=data_ui, tag="input"
            )
            if not selector:
                if inp_name:
                    selector = f"input[name='{inp_name}']"
                else:
                    continue
            # Prefer name-based selectors for standard fields (more stable than random ids).
            if inp_name in {
                "firstname",
                "lastname",
                "email",
                "phone",
                "summary",
                "cover_letter",
                "headline",
                "address",
            }:
                selector = f"input[name='{inp_name}']"
            if selector in seen:
                continue
            seen.add(selector)
            required = (
                await inp.get_attribute("required") is not None
                or (await inp.get_attribute("aria-required")) == "true"
                or "*" in (label or "")
            )
            placeholder = (await inp.get_attribute("placeholder") or "").lower()
            is_date = await self._looks_like_date_field(page, inp, label or "", placeholder)
            fields.append(
                FormField(
                    selector=selector,
                    label=label or inp_name or data_ui,
                    field_type="date" if is_date else "text",
                    required=required,
                )
            )

        textareas = await page.query_selector_all(
            "[data-ui='application-form'] textarea"
        )
        for ta in textareas:
            ta_id = await ta.get_attribute("id") or ""
            ta_name = await ta.get_attribute("name") or ""
            data_ui = await ta.get_attribute("data-ui") or ""
            label = await self._get_label_text(page, ta)
            selector = (
                f"textarea[name='{ta_name}']"
                if ta_name
                else self._field_selector(
                    element_id=ta_id, name=ta_name, data_ui=data_ui, tag="textarea"
                )
            )
            if not selector or selector in seen:
                continue
            seen.add(selector)
            required = (
                await ta.get_attribute("required") is not None
                or (await ta.get_attribute("aria-required")) == "true"
                or "*" in (label or "")
            )
            fields.append(
                FormField(
                    selector=selector,
                    label=label or ta_name or data_ui,
                    field_type="textarea",
                    required=required,
                )
            )

        file_inputs = await page.query_selector_all(
            "[data-ui='application-form'] input[type='file'], "
            "input[data-ui='resume']"
        )
        for fi in file_inputs:
            data_ui = await fi.get_attribute("data-ui") or "resume"
            selector = f"input[data-ui='{data_ui}']"
            if selector in seen:
                continue
            seen.add(selector)
            label = await self._get_label_text(page, fi) or data_ui
            fields.append(
                FormField(
                    selector=selector,
                    label=label,
                    field_type="file",
                    required=True,
                )
            )

        for field in await self._extract_radio_groups(page):
            if field.selector not in seen:
                seen.add(field.selector)
                fields.append(field)

        for field in await self._extract_checkbox_fields(page):
            if field.selector not in seen:
                seen.add(field.selector)
                fields.append(field)

        logger.info("Workable: extracted %d fields", len(fields))
        return fields

    async def _extract_checkbox_fields(self, page: Page) -> list[FormField]:
        """Consent / legal checkboxes (not YES/NO radio groups)."""
        metas = await page.evaluate(
            """() => {
              const out = [];
              for (const cb of document.querySelectorAll(
                '[data-ui="application-form"] input[type="checkbox"]'
              )) {
                const id = cb.id || '';
                const name = cb.name || '';
                const dataUi = cb.getAttribute('data-ui') || '';
                let label = '';
                if (id) {
                  label = document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText || '';
                }
                if (!label) {
                  label = cb.closest('label')?.innerText
                    || cb.getAttribute('aria-label')
                    || '';
                }
                label = (label || name || id || dataUi).replace(/\\s+/g, ' ').trim();
                const required = Boolean(
                  cb.required
                  || cb.getAttribute('aria-required') === 'true'
                  || /proceed|agree|consent|accept|confirm/i.test(label)
                );
                let selector = '';
                if (id) selector = `input[type="checkbox"]#${CSS.escape(id)}`;
                else if (dataUi) selector = `input[type="checkbox"][data-ui="${dataUi}"]`;
                else if (name) selector = `input[type="checkbox"][name="${name}"]`;
                if (!selector) continue;
                out.push({ selector, label, required });
              }
              return out;
            }"""
        )
        fields: list[FormField] = []
        for meta in metas:
            fields.append(
                FormField(
                    selector=meta["selector"],
                    label=self._clean_label(meta.get("label") or "checkbox"),
                    field_type="checkbox",
                    required=bool(meta.get("required")),
                    options=["YES", "NO"],
                )
            )
        return fields

    async def _dismiss_overlays(self, page: Page) -> None:
        """Dismiss cookie banners and close intl-tel-input country lists.

        Avoids sending Escape — on jobs.workable.com that closes the apply panel.
        """
        await self._dismiss_cookie_banner(page)
        await page.evaluate(
            """() => {
              for (const list of document.querySelectorAll('.iti__country-list')) {
                list.classList.add('iti__hide');
              }
              for (const content of document.querySelectorAll('.iti__dropdown-content')) {
                content.classList.add('iti__hide');
                content.style.pointerEvents = 'none';
              }
              for (const flag of document.querySelectorAll('.iti__selected-flag')) {
                flag.setAttribute('aria-expanded', 'false');
              }
              // Cookie modal backdrops that steal pointer events.
              for (const el of document.querySelectorAll('[data-ui="backdrop"]')) {
                const consent = document.querySelector('[data-ui="cookie-consent"]');
                if (consent && consent.offsetParent !== null) {
                  el.style.pointerEvents = 'none';
                }
              }
            }"""
        )
        await random_pause(0.1, 0.25)

    def _parse_phone(self, raw: str) -> tuple[str | None, str]:
        """Return ``(iso2_country_or_None, national_digits_or_raw)``."""
        text = (raw or "").strip()
        if not text:
            return None, ""

        dial_to_iso = {
            "1": "us",
            "44": "gb",
            "91": "in",
            "61": "au",
            "49": "de",
            "33": "fr",
            "81": "jp",
            "86": "cn",
            "65": "sg",
            "971": "ae",
            "353": "ie",
            "31": "nl",
            "46": "se",
            "47": "no",
            "45": "dk",
            "41": "ch",
            "34": "es",
            "39": "it",
            "55": "br",
            "52": "mx",
            "27": "za",
            "82": "kr",
            "64": "nz",
            "351": "pt",
            "48": "pl",
            "420": "cz",
            "43": "at",
            "32": "be",
            "66": "th",
            "62": "id",
            "60": "my",
            "63": "ph",
            "84": "vn",
            "92": "pk",
            "880": "bd",
            "94": "lk",
            "977": "np",
        }

        digits = re.sub(r"\D", "", text)
        iso: str | None = None
        national = digits

        if text.startswith("+") and digits:
            # Longest dial-code match first.
            for code in sorted(dial_to_iso.keys(), key=len, reverse=True):
                if digits.startswith(code) and len(digits) > len(code):
                    iso = dial_to_iso[code]
                    national = digits[len(code) :]
                    break

        return iso, national or text

    async def _select_phone_country(self, page: Page, iso2: str) -> bool:
        """Open intl-tel-input and pick a country by ISO2 code."""
        iso = iso2.strip().lower()
        if not iso:
            return False

        current = await page.evaluate(
            """() => {
              const selected = document.querySelector(
                '[data-ui="phone"] .iti__selected-flag, .iti__selected-flag'
              );
              const flag = selected?.querySelector('.iti__flag');
              const cls = (flag?.className || '').toLowerCase();
              const match = cls.match(/\\biti__([a-z]{2})\\b/);
              return match ? match[1] : '';
            }"""
        )
        if current == iso:
            return True

        await self._dismiss_overlays(page)
        flag = page.locator(
            '[data-ui="phone"] .iti__selected-flag, '
            ".iti--separate-dial-code .iti__selected-flag"
        ).first
        try:
            await flag.wait_for(state="visible", timeout=5_000)
        except Exception:
            logger.warning("Workable: phone country flag not found")
            return False

        try:
            await flag.click(timeout=3_000)
        except Exception:
            await flag.click(force=True)

        option = page.locator(
            f'.iti__country-list .iti__country[data-country-code="{iso}"]'
        ).first
        try:
            await option.wait_for(state="visible", timeout=5_000)
            try:
                await option.click(timeout=3_000)
            except Exception:
                await option.click(force=True)
        except Exception:
            # Fallback: scroll/search by dial list item id pattern used by iti.
            clicked = await page.evaluate(
                """(iso) => {
                  const item = document.querySelector(
                    `.iti__country-list .iti__country[data-country-code="${iso}"]`
                  );
                  if (!item) return false;
                  item.scrollIntoView({ block: 'center' });
                  item.click();
                  return true;
                }""",
                iso,
            )
            if not clicked:
                logger.warning("Workable: country option %s not found", iso)
                await self._dismiss_overlays(page)
                return False

        await random_pause(0.2, 0.4)
        await self._dismiss_overlays(page)
        logger.info("Workable: selected phone country %s", iso)
        return True

    async def _safe_fill(self, page: Page, selector: str, value: str) -> None:
        """Fill a field even when cookie/iti overlays intercept pointer events."""
        await self._dismiss_overlays(page)
        locator = page.locator(selector).first
        await locator.wait_for(state="attached", timeout=10_000)
        try:
            await locator.click(timeout=2_000)
        except Exception:
            try:
                await locator.click(force=True, timeout=2_000)
            except Exception:
                pass

        text = str(value)
        # Prefer fill() — Workable React inputs often ignore key-by-key typing.
        try:
            await locator.fill(text)
        except Exception:
            await locator.evaluate(
                """(el, val) => {
                  const setter = Object.getOwnPropertyDescriptor(
                    window.HTMLInputElement.prototype, 'value'
                  )?.set || Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, 'value'
                  )?.set;
                  if (setter) setter.call(el, val);
                  else el.value = val;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }""",
                text,
            )
        await random_pause(0.1, 0.25)

    async def _fill_phone(self, page: Page, phone: str) -> bool:
        """Select country (if E.164) and type the national number."""
        iso, national = self._parse_phone(phone)
        if not national:
            return False

        phone_sel = (
            'input[name="phone"], [data-ui="phone"] input[type="tel"]'
        )
        if await page.query_selector(phone_sel) is None:
            return False

        if iso:
            await self._select_phone_country(page, iso)

        await self._safe_fill(page, phone_sel, national)
        actual = (await page.input_value(phone_sel)).strip()
        return bool(actual)

    async def _looks_like_date_field(
        self,
        page: Page,
        element,
        label: str,
        placeholder: str = "",
    ) -> bool:
        """Detect Workable date pickers (DD/MM/YYYY)."""
        if (await element.get_attribute("type") or "").lower() == "date":
            return True
        if "dd/mm/yyyy" in placeholder or "dd/mm/yy" in placeholder:
            return True
        in_date_wrap = await element.evaluate(
            """el => Boolean(
              el.closest('[data-input-type="date"]')
              || el.closest('[class*="date"]')
            )"""
        )
        if in_date_wrap:
            return True
        return self._is_date_label(label)

    def _is_date_label(self, label: str) -> bool:
        text = (label or "").lower()
        return any(
            token in text
            for token in (
                "date",
                "graduat",
                "birth",
                "dob",
                "when are you",
                "start date",
                "end date",
                "available from",
            )
        )

    def _default_date_value(self, label: str, cv_data: CVData) -> str:
        """Pick a sensible DD/MM/YYYY default for Workable date fields."""
        label_l = (label or "").lower()
        for edu in cv_data.education or []:
            for key in ("end_date", "graduation", "graduation_date", "year", "end"):
                raw = edu.get(key)
                if not raw:
                    continue
                parsed = self._parse_date_to_ddmmyyyy(str(raw))
                if parsed:
                    return parsed

        now = datetime.now()
        if "graduat" in label_l:
            year = now.year + (1 if now.month >= 6 else 0)
            return f"01/06/{year}"
        if "birth" in label_l or "dob" in label_l:
            return "01/01/1998"
        if "start" in label_l:
            return now.strftime("%d/%m/%Y")
        return now.strftime("%d/%m/%Y")

    def _parse_date_to_ddmmyyyy(self, raw: str) -> str | None:
        text = raw.strip()
        if not text:
            return None
        # Already DD/MM/YYYY
        if re.fullmatch(r"\d{2}/\d{2}/\d{4}", text):
            return text
        # YYYY-MM-DD
        m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
        if m:
            return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
        # Year only
        m = re.fullmatch(r"(\d{4})", text)
        if m:
            return f"01/06/{m.group(1)}"
        # Month YYYY e.g. June 2026
        m = re.search(r"(\d{4})", text)
        if m:
            return f"01/06/{m.group(1)}"
        return None

    async def _fill_date_field(
        self,
        page: Page,
        selector: str,
        value: str,
        *,
        label: str = "",
        cv_data: CVData | None = None,
    ) -> bool:
        """Fill Workable DD/MM/YYYY date picker (React + calendar widget)."""
        date_val = self._parse_date_to_ddmmyyyy(value)
        if not date_val:
            date_val = self._default_date_value(label, cv_data or CVData(
                full_name="Candidate", email="candidate@example.com"
            ))
        if not re.fullmatch(r"\d{2}/\d{2}/\d{4}", date_val):
            return False
        loc = page.locator(selector).first
        if await loc.count() == 0:
            return False
        await loc.wait_for(state="attached", timeout=10_000)

        async def _read_value() -> str:
            try:
                return (await loc.input_value()).strip()
            except Exception:
                return ""

        try:
            await loc.click(timeout=3_000)
        except Exception:
            await loc.click(force=True)
        await random_pause(0.25, 0.5)

        # Strategy 1: keyboard type DD/MM/YYYY (masked inputs).
        try:
            await loc.press("Meta+A")
            await loc.press("Backspace")
        except Exception:
            try:
                await loc.fill("")
            except Exception:
                pass
        await page.keyboard.type(date_val, delay=90)
        await random_pause(0.2, 0.4)
        await page.keyboard.press("Tab")
        await random_pause(0.15, 0.3)
        if await _read_value():
            logger.info("Workable: filled date %s -> %s", selector[:40], date_val)
            return True

        # Strategy 2: native value setter + React events.
        await loc.evaluate(
            """(el, val) => {
              const setter = Object.getOwnPropertyDescriptor(
                HTMLInputElement.prototype, 'value'
              )?.set;
              if (setter) setter.call(el, val);
              else el.value = val;
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
              el.dispatchEvent(new Event('blur', { bubbles: true }));
            }""",
            date_val,
        )
        await random_pause(0.15, 0.3)
        if await _read_value():
            logger.info("Workable: filled date (setter) %s -> %s", selector[:40], date_val)
            return True

        # Strategy 3: click day in open calendar popup.
        day_num = str(int(date_val.split("/")[0]))
        for day_sel in (
            f'[role="gridcell"] button:has-text("{day_num}")',
            f'[role="gridcell"]:has-text("{day_num}")',
            f'.react-datepicker__day--0{day_num.zfill(2)}',
            f'button:has-text("{day_num}")',
        ):
            day_loc = page.locator(day_sel).first
            try:
                if await day_loc.count() == 0:
                    continue
                await day_loc.click(timeout=2_000)
                await random_pause(0.25, 0.5)
                if await _read_value():
                    logger.info(
                        "Workable: filled date (picker) %s -> %s",
                        selector[:40],
                        date_val,
                    )
                    return True
            except Exception:
                continue

        logger.warning(
            "Workable: date field remained empty %s (wanted %s)",
            selector[:40],
            date_val,
        )
        return False

    async def _fill_text(
        self, page: Page, selector: str, value: str, *, cv_data: CVData | None = None
    ) -> None:
        text = str(value)
        target = selector
        if (
            selector == "[data-ui='phone']"
            or selector == "input[name='phone']"
            or "phone" in selector
        ):
            await self._fill_phone(page, text)
            return

        field_el = await page.query_selector(selector)
        if field_el is not None:
            label = await self._get_label_text(page, field_el)
            placeholder = (await field_el.get_attribute("placeholder") or "").lower()
            if await self._looks_like_date_field(
                page, field_el, label or "", placeholder
            ):
                await self._fill_date_field(
                    page,
                    selector,
                    text,
                    label=label or "",
                    cv_data=cv_data,
                )
                return

        await self._safe_fill(page, target, text)

    def _normalize_yes_no(self, value: str) -> str:
        choice = str(value).strip()
        if choice.lower().startswith("literal:"):
            choice = choice.split(":", 1)[1].strip()
        lowered = choice.lower()
        if lowered in {"true", "1", "y", "yes"} or lowered.startswith("yes"):
            return "YES"
        if (
            lowered in {"false", "0", "n", "no"}
            or lowered.startswith("no")
            or "not" in lowered
        ):
            return "NO"
        return choice

    async def _click_radio_option(self, page: Page, name: str, value: str) -> bool:
        """Select a Workable YES/NO (or multi) radio via real label clicks.

        DOM ``.click()`` from ``page.evaluate`` does not update React state on
        these widgets — Playwright label clicks do.
        """
        await self._dismiss_overlays(page)
        choice = self._normalize_yes_no(value)
        want_bool = (
            "true"
            if choice.upper() == "YES"
            else "false"
            if choice.upper() == "NO"
            else None
        )

        radios = page.locator(f'input[type="radio"][name="{name}"]')
        count = await radios.count()
        if count == 0:
            return False

        for idx in range(count):
            radio = radios.nth(idx)
            radio_value = (await radio.get_attribute("value") or "").strip()
            radio_id = await radio.get_attribute("id") or ""
            label_text = ""
            if radio_id:
                label = page.locator(f'label[for="{radio_id}"]').first
                if await label.count():
                    label_text = (await label.inner_text()).strip()
            if not label_text:
                parent_label = radio.locator("xpath=ancestor::label[1]")
                if await parent_label.count():
                    label_text = (await parent_label.inner_text()).strip()

            text_norm = re.sub(r"\s+", " ", label_text).strip().lower()
            choice_norm = choice.strip().lower()
            matched = False
            if want_bool and radio_value == want_bool:
                matched = True
            elif text_norm == choice_norm or choice_norm in text_norm or text_norm in choice_norm:
                matched = True

            if not matched:
                continue

            # Prefer clicking the wrapping label — that flips React state.
            clicked = False
            if radio_id:
                label = page.locator(f'label[for="{radio_id}"]').first
                if await label.count():
                    try:
                        await label.click(force=True, timeout=3_000)
                        clicked = True
                    except Exception:
                        pass
            if not clicked:
                parent_label = radio.locator("xpath=ancestor::label[1]")
                if await parent_label.count():
                    try:
                        await parent_label.click(force=True, timeout=3_000)
                        clicked = True
                    except Exception:
                        pass
            if not clicked:
                try:
                    await radio.check(force=True, timeout=3_000)
                    clicked = True
                except Exception:
                    try:
                        await radio.click(force=True, timeout=3_000)
                        clicked = True
                    except Exception:
                        pass

            if clicked:
                await random_pause(0.15, 0.35)
                checked = await radio.is_checked()
                if checked:
                    return True
                # Last resort: set checked + dispatch input/change for React.
                await radio.evaluate(
                    """el => {
                      el.checked = true;
                      el.dispatchEvent(new Event('input', { bubbles: true }));
                      el.dispatchEvent(new Event('change', { bubbles: true }));
                      const wrap = el.closest('[role="radio"]');
                      if (wrap) wrap.setAttribute('aria-checked', 'true');
                    }"""
                )
                return True

        # Fallback: click the last option (often NO) via its label.
        last = radios.nth(count - 1)
        radio_id = await last.get_attribute("id") or ""
        if radio_id:
            label = page.locator(f'label[for="{radio_id}"]').first
            if await label.count():
                await label.click(force=True)
                await random_pause(0.15, 0.35)
                return True
        return False

    async def _upload_resume(self, page: Page, cv_data: CVData) -> tuple[bool, str | None]:
        resume_input = await page.query_selector(
            "input[data-ui='resume'], "
            "[data-ui='application-form'] input[type='file']"
        )
        if resume_input is None:
            return False, "Workable resume input not found"

        async with prepare_resume_file(cv_data) as resume_path:
            if resume_path is None:
                return False, "Resume file not available for upload"
            await resume_input.set_input_files(str(resume_path))
            uploaded = await resume_input.evaluate(
                "el => Boolean(el.files && el.files.length > 0)"
            )
            if not uploaded:
                return False, "Failed to attach resume to Workable resume field"

        logger.info("Workable: resume attached")
        await random_pause(0.8, 1.5)
        if not await self._resume_ready(page):
            logger.warning("Workable: resume input set but UI not ready")
        return True, None

    async def _resume_ready(self, page: Page) -> bool:
        """True when Workable shows a resume attached (input or filename chip)."""
        return await page.evaluate(
            """() => {
              const input = document.querySelector(
                "input[data-ui='resume'], [data-ui='application-form'] input[type='file']"
              );
              if (input?.files?.length) return true;
              const wrap = document.querySelector('[data-ui="resume"]');
              const text = (wrap?.innerText || '').toLowerCase();
              if (/\\.(pdf|doc|docx)\\b/.test(text)) return true;
              if (text.includes('remove') || text.includes('uploaded')) return true;
              return false;
            }"""
        )

    async def _ensure_resume_attached(
        self, page: Page, cv_data: CVData
    ) -> tuple[bool, str | None]:
        """Re-attach resume if React cleared the file input before submit."""
        if await self._resume_ready(page):
            return True, None
        logger.info("Workable: resume missing before submit — re-attaching")
        return await self._upload_resume(page, cv_data)

    async def _fill_checkbox(self, page: Page, selector: str, value: str) -> bool:
        truthy = {"1", "true", "yes", "y", "on", "checked"}
        if str(value).strip().lower() not in truthy:
            return False
        cb = page.locator(selector).first
        if await cb.count() == 0:
            return False
        if await cb.is_checked():
            return True
        cb_id = await cb.get_attribute("id")
        if cb_id:
            label = page.locator(f'label[for="{cb_id}"]').first
            if await label.count():
                try:
                    await label.click(timeout=3_000)
                except Exception:
                    await label.click(force=True)
                await random_pause(0.15, 0.35)
                return await cb.is_checked()
        try:
            await cb.check(force=True)
        except Exception:
            await cb.click(force=True)
        await random_pause(0.15, 0.35)
        return await cb.is_checked()

    async def _fill_required_checkboxes(self, page: Page) -> int:
        """Check consent / required checkboxes Workable validates on submit."""
        filled = 0
        boxes = await page.query_selector_all(
            '[data-ui="application-form"] input[type="checkbox"]'
        )
        for cb in boxes:
            try:
                if await cb.is_checked():
                    continue
                required = await cb.get_attribute("required") is not None
                aria_req = (await cb.get_attribute("aria-required")) == "true"
                cb_id = await cb.get_attribute("id") or ""
                label_text = ""
                if cb_id:
                    label_el = await page.query_selector(f'label[for="{cb_id}"]')
                    if label_el:
                        label_text = (await label_el.inner_text()).lower()
                if not (
                    required
                    or aria_req
                    or any(
                        token in label_text
                        for token in (
                            "proceed",
                            "agree",
                            "consent",
                            "accept",
                            "confirm",
                            "privacy",
                            "terms",
                        )
                    )
                ):
                    continue
                selector = (
                    f'input[type="checkbox"][id="{cb_id}"]'
                    if cb_id
                    else f'input[type="checkbox"][name="{await cb.get_attribute("name") or ""}"]'
                )
                if await self._fill_checkbox(page, selector, "YES"):
                    filled += 1
                    logger.info(
                        "Workable: checked consent checkbox %s",
                        cb_id or label_text[:40],
                    )
            except Exception:
                logger.debug(
                    "Workable: checkbox fill failed", exc_info=True
                )
        return filled

    async def _fill_identity_fields(self, page: Page, cv_data: CVData) -> int:
        first = cv_data.full_name.split()[0] if cv_data.full_name else ""
        last = (
            " ".join(cv_data.full_name.split()[1:]) if cv_data.full_name else ""
        ) or first
        filled = 0

        await self._dismiss_overlays(page)

        for selector, label, value in (
            ("input[name='firstname']", "First name", first),
            ("input[name='lastname']", "Last name", last),
            ("input[name='email']", "Email", cv_data.email),
        ):
            if not value:
                logger.warning("Workable: no value available for %s", label)
                continue
            element = await page.query_selector(selector)
            if element is None:
                logger.warning("Workable: %s field not found", label)
                continue
            await self._safe_fill(page, selector, str(value))
            actual = await page.input_value(selector)
            if actual.strip():
                filled += 1
                logger.info("Workable: filled %s", label)
            else:
                logger.warning("Workable: %s remained empty after fill", label)

        phone = (cv_data.phone or "").strip() or settings.default_phone
        if phone:
            if await self._fill_phone(page, phone):
                filled += 1
                logger.info("Workable: filled Phone")
            else:
                logger.warning("Workable: Phone remained empty after fill")
        else:
            logger.warning("Workable: no value available for Phone")

        return filled

    async def _fill_required_gaps(self, page: Page, cv_data: CVData) -> int:
        """Fill any still-empty required fields with suitable test defaults."""
        filled = 0
        await self._dismiss_overlays(page)

        # Phone
        phone_sel = 'input[name="phone"], [data-ui="phone"] input[type="tel"]'
        phone_el = await page.query_selector(phone_sel)
        if phone_el is not None:
            current = (await page.input_value(phone_sel)).strip()
            if not current:
                phone = (cv_data.phone or "").strip() or settings.default_phone
                if phone and await self._fill_phone(page, phone):
                    filled += 1
                    logger.info("Workable: gap-filled Phone with default")

        # Required radios with no selection
        unchecked_groups = await page.evaluate(
            """() => {
              const names = new Set();
              for (const r of document.querySelectorAll(
                '[data-ui="application-form"] input[type=radio]'
              )) {
                if (!r.name) continue;
                const group = [...document.querySelectorAll(
                  `input[type=radio][name="${CSS.escape(r.name)}"]`
                )];
                if (group.some(x => x.checked)) continue;
                if (group.some(x => x.required || x.getAttribute('aria-required') === 'true')) {
                  names.add(r.name);
                }
              }
              return [...names];
            }"""
        )
        for name in unchecked_groups:
            label = (
                await page.evaluate(
                    """(name) => {
                      const fs = document.querySelector(
                        `fieldset[data-ui="${name}"], [data-ui="${name}"]`
                      );
                      return (fs?.innerText || name).toLowerCase();
                    }""",
                    name,
                )
                or ""
            )
            # Prefer safe NO for sponsorship / relocate / visa style questions.
            default = (
                "NO"
                if any(
                    token in label
                    for token in ("sponsor", "visa", "relocat", "authorize")
                )
                else "YES"
            )
            if await self._click_radio_option(page, name, default):
                filled += 1
                logger.info("Workable: gap-filled radio %s -> %s", name, default)

        filled += await self._fill_required_checkboxes(page)

        # Empty required text / textarea (skip file/hidden/identity already done)
        empties = await page.evaluate(
            """() => {
              const out = [];
              const nodes = document.querySelectorAll(
                '[data-ui="application-form"] input:not([type=hidden]):not([type=file]):not([type=radio]):not([type=checkbox]):not([readonly]), '
                + '[data-ui="application-form"] textarea'
              );
              for (const el of nodes) {
                const required = el.required || el.getAttribute('aria-required') === 'true';
                if (!required) continue;
                if ((el.value || '').trim()) continue;
                if (el.closest('[data-input-type="select"]')) continue;
                const name = el.name || '';
                if (['firstname','lastname','email','phone'].includes(name)) continue;
                const dataUi = el.getAttribute('data-ui') || '';
                const tag = el.tagName.toLowerCase();
                let selector = '';
                if (dataUi) selector = `${tag}[data-ui="${dataUi}"]`;
                else if (name) selector = `${tag}[name="${name}"]`;
                else if (el.id) selector = `[id="${el.id}"]`;
                if (!selector) continue;
                const label = (
                  document.getElementById((dataUi || name) + '_label')?.innerText
                  || el.getAttribute('aria-label')
                  || document.querySelector(`label[for="${el.id}"]`)?.innerText
                  || name
                  || dataUi
                  || ''
                ).replace(/\\s+/g, ' ').trim();
                const placeholder = (el.placeholder || '').toLowerCase();
                const isDate = el.type === 'date'
                  || /dd\\/mm\\/yyyy/i.test(placeholder)
                  || Boolean(el.closest('[data-input-type="date"]'));
                out.push({ selector, name, dataUi, tag, label, placeholder, isDate });
              }
              return out;
            }"""
        )
        for item in empties:
            label = (item.get("label") or item.get("name") or "").lower()
            if item.get("isDate") or self._is_date_label(label):
                date_val = self._default_date_value(label, cv_data)
                if await self._fill_date_field(
                    page,
                    item["selector"],
                    date_val,
                    label=label,
                    cv_data=cv_data,
                ):
                    filled += 1
                    logger.info(
                        "Workable: gap-filled date %s -> %s",
                        item["selector"][:40],
                        date_val,
                    )
                else:
                    logger.warning(
                        "Workable: gap-fill left empty %s", item["selector"]
                    )
                continue
            if "salary" in label or "compensat" in label:
                value = "1500000"
            elif ("expect" in label and "graduat" not in label) or "ctc" in label:
                value = "1500000"
            elif "notice" in label or "days" in label:
                value = "30"
            elif "start" in label:
                value = "Immediate"
            elif "city" in label:
                value = (cv_data.location or "Bengaluru").split(",")[0].strip()
            elif "address" in label:
                value = "123 Test Street"
            elif "postcode" in label or "zip" in label or "postal" in label:
                value = "560001"
            elif "linkedin" in label:
                value = cv_data.linkedin_url or settings.default_linkedin_url or "https://www.linkedin.com/in/test"
            elif "github" in label:
                value = cv_data.github_url or "https://github.com/test"
            elif item.get("tag") == "textarea":
                value = (
                    cv_data.summary
                    or "I am excited about this role and believe my experience is a strong fit."
                )
            else:
                value = "Test"
            try:
                await self._safe_fill(page, item["selector"], value)
                # Verify; retry via name selector if needed.
                actual = ""
                try:
                    actual = (await page.input_value(item["selector"])).strip()
                except Exception:
                    pass
                if not actual and item.get("name"):
                    await self._safe_fill(
                        page, f'{item["tag"]}[name="{item["name"]}"]', value
                    )
                    actual = (
                        await page.input_value(
                            f'{item["tag"]}[name="{item["name"]}"]'
                        )
                    ).strip()
                if actual:
                    filled += 1
                    logger.info(
                        "Workable: gap-filled %s with %r",
                        item["selector"][:40],
                        value[:40],
                    )
                else:
                    logger.warning(
                        "Workable: gap-fill left empty %s", item["selector"]
                    )
            except Exception:
                logger.warning(
                    "Workable: gap-fill failed for %s", item["selector"], exc_info=True
                )

        # Final sweep: any still-invalid required controls.
        still_invalid = await page.evaluate(
            """() => [...document.querySelectorAll(
              '[data-ui="application-form"] input:invalid, '
              + '[data-ui="application-form"] textarea:invalid'
            )].map(el => ({
              name: el.name || '',
              dataUi: el.getAttribute('data-ui') || '',
              type: el.type || '',
              tag: el.tagName.toLowerCase(),
            }))"""
        )
        for item in still_invalid:
            name = item.get("name") or ""
            data_ui = item.get("dataUi") or ""
            if item.get("type") == "radio" and name:
                if await self._click_radio_option(page, name, "YES"):
                    filled += 1
                continue
            if item.get("type") in {"file", "hidden", "checkbox"}:
                continue
            if name == "phone" or data_ui == "phone":
                phone = (cv_data.phone or "").strip() or settings.default_phone
                if phone and await self._fill_phone(page, phone):
                    filled += 1
                continue
            selector = (
                f'{item["tag"]}[data-ui="{data_ui}"]'
                if data_ui
                else f'{item["tag"]}[name="{name}"]'
                if name
                else ""
            )
            if not selector:
                continue
            label = ""
            if data_ui:
                label = (
                    await page.evaluate(
                        """(id) => (document.getElementById(id + '_label')
                          ?.innerText || '').toLowerCase()""",
                        data_ui,
                    )
                    or ""
                )
            if item.get("type") == "date" or self._is_date_label(label):
                date_val = self._default_date_value(label, cv_data)
                if await self._fill_date_field(
                    page, selector, date_val, label=label, cv_data=cv_data
                ):
                    filled += 1
                continue
            value = "30" if "13322" in (name + data_ui) else "Test"
            try:
                await self._safe_fill(page, selector, value)
                filled += 1
            except Exception:
                logger.debug("Workable: invalid sweep failed for %s", selector)

        # Empty required selects — pick first option or location country.
        for data_ui in await page.evaluate(
            """() => [...document.querySelectorAll(
              '[data-ui="application-form"] [data-input-type="select"]'
            )].map(el => el.getAttribute('data-ui')).filter(Boolean)"""
        ):
            hidden_val = await page.evaluate(
                """(id) => {
                  const wrap = document.querySelector(
                    `[data-ui="${id}"][data-input-type="select"]`
                  );
                  const hidden = wrap?.querySelector('input[name]');
                  const required = Boolean(hidden?.required);
                  return { value: (hidden?.value || '').trim(), required };
                }""",
                data_ui,
            )
            if not hidden_val or hidden_val.get("value"):
                continue
            if not hidden_val.get("required"):
                continue
            label = (
                await page.evaluate(
                    """(id) => (document.getElementById(id + '_label')
                      ?.innerText || '').toLowerCase()""",
                    data_ui,
                )
                or ""
            )
            if "country" in label:
                guess = (
                    (cv_data.location or "India").split(",")[-1].strip() or "India"
                )
            else:
                guess = "Yes"
            if await self._fill_select(page, data_ui, guess):
                filled += 1
            else:
                if await self._fill_select(page, data_ui, ""):
                    filled += 1

        return filled

    async def _collect_validation_errors(self, page: Page) -> list[str]:
        return await page.evaluate(
            """() => {
              const errors = new Set();
              const visible = el => {
                const s = getComputedStyle(el);
                const r = el.getBoundingClientRect();
                return s.display !== 'none' && s.visibility !== 'hidden'
                  && r.width > 0 && r.height > 0;
              };
              for (const el of document.querySelectorAll(
                '[role="alert"], [aria-live="assertive"], [class*="error"], [class*="invalid"]'
              )) {
                const text = (el.innerText || '').replace(/\\s+/g, ' ').trim();
                if (text && visible(el)) errors.add(text.slice(0, 240));
              }
              for (const el of document.querySelectorAll(
                'input[aria-invalid="true"], textarea[aria-invalid="true"], :invalid'
              )) {
                const name = (el.getAttribute('data-ui') || el.name || el.id || 'field')
                  .replace(/\\s+/g, ' ').trim();
                const message = el.validationMessage || 'invalid or required';
                errors.add(`${name}: ${message}`.slice(0, 240));
              }
              return [...errors];
            }"""
        )

    async def _page_looks_successful(self, page: Page) -> bool:
        """Require Workable's post-submit confirmation page.

        Expected UI includes:
        - heading "Thank you!"
        - "Your application has been submitted successfully."
        - optional profile-update prompt ("No, skip" / "Yes, update")
        """
        if await page.query_selector(_SUCCESS_SELECTOR):
            return True

        body = (await page.inner_text("body")).lower()
        has_thanks = "thank you" in body
        has_submitted = (
            "application has been submitted successfully" in body
            or "your application has been submitted" in body
        )
        has_secondary = any(token in body for token in _SUCCESS_SECONDARY)
        if has_thanks and has_submitted:
            return True
        if has_submitted and has_secondary:
            return True
        return False

    async def _wait_for_turnstile(
        self, page: Page, timeout_ms: int = 10_000
    ) -> bool:
        """Poll for the Cloudflare Turnstile widget Workable adds on submit."""
        deadline = asyncio.get_event_loop().time() + (timeout_ms / 1000)
        while asyncio.get_event_loop().time() < deadline:
            if await detect_turnstile(page):
                return True
            await asyncio.sleep(0.5)

        logger.info(
            "Workable: no Turnstile widget after submit (frames=%s)",
            [f.url[:60] for f in page.frames][:6],
        )
        return False

    async def _wait_for_submit_result(
        self, page: Page, *, api_ok: bool = False
    ) -> tuple[bool, str]:
        # Prefer explicit confirmation UI over API-only heuristics.
        try:
            await page.wait_for_function(
                """() => {
                  const body = (document.body?.innerText || '').toLowerCase();
                  if (document.querySelector(
                    "[data-ui='successful-submit'], .application-confirmation, [class*='successful-submit']"
                  )) return true;
                  const thanks = body.includes('thank you');
                  const submitted = body.includes('application has been submitted successfully')
                    || body.includes('your application has been submitted');
                  const secondary = body.includes('would you like to update your profile')
                    || body.includes('no, skip')
                    || body.includes('yes, update');
                  return (thanks && submitted) || (submitted && secondary);
                }""",
                timeout=20_000,
            )
            return True, "thank-you confirmation page detected"
        except Exception:
            pass

        if await self._page_looks_successful(page):
            return True, "thank-you confirmation page detected"

        if api_ok and await self._page_looks_successful(page):
            return True, "submit API ok + confirmation UI"

        validation_errors = await self._collect_validation_errors(page)
        field_errors = [
            err
            for err in validation_errors
            if not err.lower().startswith("application-form:")
        ]
        if field_errors:
            return False, "; ".join(field_errors[:8])

        if await page.query_selector(_SUBMIT_SELECTOR) and await page.query_selector(
            _IDENTITY_SELECTOR
        ):
            return (
                False,
                "submit clicked but Workable thank-you confirmation page did not appear",
            )

        return (
            False,
            "Workable thank-you confirmation page not detected after submit",
        )

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        try:
            await self.ensure_application_form(page)

            ok, error = await self._upload_resume(page, cv_data)
            if not ok:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=error,
                )
            filled += 1

            filled += await self._fill_identity_fields(page, cv_data)

            # Optional summary / cover letter from CV when present.
            if cv_data.summary:
                summary_el = await page.query_selector(
                    "textarea[name='summary'], textarea[data-ui='summary']"
                )
                if summary_el is not None:
                    current = (await summary_el.input_value()).strip()
                    if not current:
                        await self._fill_text(
                            page,
                            "textarea[name='summary'], textarea[data-ui='summary']",
                            cv_data.summary,
                            cv_data=cv_data,
                        )
                        filled += 1

            for selector, cv_key in field_mapping.items():
                value = resolve_mapped_value(cv_data, cv_key)
                if value is None:
                    continue

                if selector.startswith("workable-radio:"):
                    name = selector[len("workable-radio:") :]
                    if await self._click_radio_option(page, name, str(value)):
                        filled += 1
                        logger.info(
                            "Workable: radio %s -> %s", name[:40], value
                        )
                    else:
                        logger.warning(
                            "Workable: failed radio select for %s", name[:60]
                        )
                    continue

                if selector.startswith("workable-select:"):
                    data_ui = selector[len("workable-select:") :]
                    if await self._fill_select(page, data_ui, str(value)):
                        filled += 1
                    else:
                        logger.warning(
                            "Workable: failed select %s with %r", data_ui, value
                        )
                    continue

                field_el = await page.query_selector(selector)
                if field_el is None:
                    # Phone / identity already filled; skip missing mapped fields.
                    logger.warning("Workable: missing field %s", selector)
                    continue

                input_type = (await field_el.get_attribute("type") or "").lower()
                if input_type == "file":
                    continue
                if input_type == "checkbox":
                    if await self._fill_checkbox(page, selector, str(value)):
                        filled += 1
                        logger.info("Workable: checkbox %s", selector[:50])
                    continue
                if input_type == "radio":
                    name = await field_el.get_attribute("name") or ""
                    if name and await self._click_radio_option(
                        page, name, str(value)
                    ):
                        filled += 1
                    continue

                # Skip identity fields we already filled deterministically.
                name = await field_el.get_attribute("name") or ""
                if name in {"firstname", "lastname", "email", "phone"}:
                    continue

                # Readonly comboboxes should go through select handler.
                readonly = await field_el.get_attribute("readonly")
                role = (await field_el.get_attribute("role") or "").lower()
                if readonly is not None or role == "combobox":
                    data_ui = await field_el.evaluate(
                        """el => el.closest('[data-input-type="select"]')
                          ?.getAttribute('data-ui') || ''"""
                    )
                    if data_ui and await self._fill_select(
                        page, str(data_ui), str(value)
                    ):
                        filled += 1
                    continue

                await self._fill_text(page, selector, str(value), cv_data=cv_data)
                filled += 1

            # Ensure required Country select gets a value from CV location.
            if cv_data.location:
                country_guess = cv_data.location.split(",")[-1].strip()
                for data_ui in await page.evaluate(
                    """() => [...document.querySelectorAll(
                      '[data-ui="application-form"] [data-input-type="select"]'
                    )].map(el => el.getAttribute('data-ui')).filter(Boolean)"""
                ):
                    label = (
                        await page.evaluate(
                            """(id) => (document.getElementById(id + '_label')
                              ?.innerText || '').toLowerCase()""",
                            data_ui,
                        )
                        or ""
                    )
                    if "country" not in label:
                        continue
                    hidden_val = await page.evaluate(
                        """(id) => {
                          const wrap = document.querySelector(
                            `[data-ui="${id}"][data-input-type="select"]`
                          );
                          const hidden = wrap?.querySelector('input[name]');
                          return (hidden?.value || '').trim();
                        }""",
                        data_ui,
                    )
                    if hidden_val:
                        continue
                    if await self._fill_select(page, data_ui, country_guess):
                        filled += 1

            gap_filled = await self._fill_required_gaps(page, cv_data)
            filled += gap_filled
            if gap_filled:
                logger.info("Workable: gap-filled %d required fields", gap_filled)

            ok, error = await self._ensure_resume_attached(page, cv_data)
            if not ok:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=error or "Resume not attached before submit",
                )

            consent_checked = await self._fill_required_checkboxes(page)
            if consent_checked:
                filled += consent_checked
                logger.info(
                    "Workable: checked %d consent checkbox(es) before submit",
                    consent_checked,
                )

            await random_pause(0.5, 1.0)

            submit_btn = await page.query_selector(_SUBMIT_SELECTOR)
            if not submit_btn:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error="Workable submit button not found",
                )

            await self._dismiss_overlays(page)

            # Turnstile occasionally renders with the form rather than on submit.
            if await detect_turnstile(page):
                captcha_error = await ensure_captcha_cleared(
                    page, silent_timeout_ms=20_000
                )
                if captcha_error:
                    logger.warning(
                        "Workable: captcha blocked submit: %s", captcha_error
                    )
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=captcha_error,
                    )

            logger.info("Workable: clicking submit (%d fields filled)", filled)

            async def _click_submit_and_wait(api_timeout_ms: int = 20_000) -> bool:
                try:
                    async with page.expect_response(
                        _is_workable_submit_response, timeout=api_timeout_ms
                    ) as pending:
                        submit_loc = page.locator(_SUBMIT_SELECTOR).first
                        try:
                            await submit_loc.click(timeout=5_000)
                        except Exception:
                            await submit_loc.click(force=True)
                        response = await pending.value
                    logger.info(
                        "Workable: application submit API succeeded (%s %s)",
                        response.status,
                        response.url[:120],
                    )
                    return True
                except Exception:
                    logger.info(
                        "Workable: no application submit API response; using page heuristics"
                    )
                    return False

            api_ok = await _click_submit_and_wait()

            # Turnstile is rendered only after the first submit click.
            if await self._wait_for_turnstile(page):
                captcha_error = await ensure_captcha_cleared(
                    page, silent_timeout_ms=20_000
                )
                if captcha_error:
                    logger.warning(
                        "Workable: captcha blocked submit: %s", captcha_error
                    )
                    return FillResult(
                        success=False,
                        ats_type=self.ats_name,
                        fields_filled=filled,
                        error=captcha_error,
                    )

                # Workable needs one more submit click once the token is set.
                if await page.query_selector(_SUBMIT_SELECTOR):
                    logger.info("Workable: Turnstile cleared; re-clicking submit")
                    await self._dismiss_overlays(page)
                    api_ok = await _click_submit_and_wait() or api_ok

            success, detail = await self._wait_for_submit_result(
                page, api_ok=api_ok
            )

            if not success:
                logger.warning("Workable validation errors: %s", detail)
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=f"Workable submit validation failed: {detail}",
                )

            logger.info(
                "Workable: filled %d fields and submitted (%s)", filled, detail
            )
            return FillResult(
                success=True, ats_type=self.ats_name, fields_filled=filled
            )

        except Exception as e:
            logger.error("Workable fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
