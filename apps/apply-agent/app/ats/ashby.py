"""Ashby ATS handler.

Ashby job pages live at ``jobs.ashbyhq.com/<company>/<id>`` (Overview)
with the apply form at ``.../<id>/application`` (Application tab).
The board UI is a React SPA — form fields only exist after navigating
to the Application route.
"""

from __future__ import annotations

import logging
from urllib.parse import urlparse, urlunparse

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import human_click, human_type, random_pause
from app.browser.linkedin_profile import resolve_linkedin_url
from app.browser.resume_upload import prepare_resume_file
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_FORM_SELECTOR = (
    "[data-testid='application-form'], "
    "form[class*='application'], "
    "input[type='email'], "
    "input[type='file']"
)
_APPLICATION_TAB_SELECTOR = (
    "button:has-text('Application'), "
    "a:has-text('Application'), "
    "[role='tab']:has-text('Application')"
)


def _css_id_selector(element_id: str) -> str:
    """Build a CSS selector for an element id.

    Ashby uses UUID ids that often start with a digit. Bare ``#976f...`` is
    invalid CSS (ids must start with a letter / underscore / hyphen), so we
    always use an attribute selector.
    """
    escaped = element_id.replace("\\", "\\\\").replace('"', '\\"')
    return f'[id="{escaped}"]'


class AshbyHandler(ATSHandler):
    ats_name = "ashby"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        if "ashbyhq.com" in url:
            return True
        ashby_el = await page.query_selector("[data-testid='application-form']")
        return ashby_el is not None

    async def ensure_application_form(self, page: Page) -> None:
        """Navigate from an Overview posting page to the Application form.

        Ashby Overview URLs look like::

            https://jobs.ashbyhq.com/<org>/<jobId>?departmentId=...

        The form only exists at::

            https://jobs.ashbyhq.com/<org>/<jobId>/application?...
        """
        parsed = urlparse(page.url)
        path = parsed.path.rstrip("/")

        if path.endswith("/application"):
            await page.wait_for_selector(_FORM_SELECTOR, timeout=20_000)
            return

        # Prefer hard navigation — Ashby SPA tabs are flaky under automation,
        # and query params like departmentId must be preserved on /application.
        apply_path = f"{path}/application"
        apply_url = urlunparse(
            (parsed.scheme, parsed.netloc, apply_path, "", parsed.query, "")
        )
        logger.info("Ashby: navigating to application URL %s", apply_url)
        await page.goto(apply_url, wait_until="domcontentloaded", timeout=45_000)

        try:
            await page.wait_for_selector(_FORM_SELECTOR, timeout=20_000)
            return
        except Exception:
            logger.warning(
                "Ashby: /application did not show form; trying Application tab"
            )

        tab = await page.query_selector(_APPLICATION_TAB_SELECTOR)
        if tab:
            logger.info("Ashby: clicking Application tab")
            await human_click(page, _APPLICATION_TAB_SELECTOR)
            await page.wait_for_selector(_FORM_SELECTOR, timeout=15_000)
            return

        raise TimeoutError(
            f"Ashby application form not found after navigating to {apply_url}"
        )

    async def _get_label_text(self, page: Page, element) -> str:
        field_id = await element.get_attribute("id") or ""
        if field_id:
            label_el = await page.query_selector(f'label[for="{field_id}"]')
            if label_el:
                text = (await label_el.inner_text()).strip()
                if text:
                    return text

        aria_label = await element.get_attribute("aria-label")
        if aria_label and aria_label.strip():
            return aria_label.strip()

        labelled_by = await element.get_attribute("aria-labelledby")
        if labelled_by:
            parts: list[str] = []
            for label_id in labelled_by.split():
                label_el = await page.query_selector(_css_id_selector(label_id))
                if label_el:
                    text = (await label_el.inner_text()).strip()
                    if text:
                        parts.append(text)
            if parts:
                return " ".join(parts)

        # Ashby wraps questions in field containers with a sibling/ancestor label.
        container = await element.evaluate_handle(
            """el => el.closest(
                '[class*="field"], [class*="question"], [data-testid], label, fieldset, div'
            )"""
        )
        container_el = container.as_element() if container else None
        if container_el:
            for sel in ("label", "h1", "h2", "h3", "h4", "p", "span"):
                label_el = await container_el.query_selector(sel)
                if label_el:
                    text = (await label_el.inner_text()).strip()
                    # Skip generic placeholders used as visual hints.
                    if text and text.lower() not in {
                        "type here...",
                        "hello@example.com...",
                        "optional",
                    }:
                        return text

        placeholder = await element.get_attribute("placeholder") or ""
        if placeholder and placeholder.lower() not in {
            "type here...",
            "hello@example.com...",
        }:
            return placeholder.strip()

        return (await element.get_attribute("name") or field_id or "").strip()

    def _field_selector(self, element_id: str, name: str, tag: str) -> str:
        if element_id:
            return _css_id_selector(element_id)
        if name:
            escaped = name.replace("\\", "\\\\").replace("'", "\\'")
            return f"{tag}[name='{escaped}']"
        return ""

    async def _extract_yes_no_fields(self, page: Page) -> list[FormField]:
        """Ashby renders boolean questions as Yes/No buttons (not native selects)."""
        groups = await page.evaluate(
            """() => {
              const out = [];
              const seen = new Set();
              const entries = document.querySelectorAll(
                '.ashby-application-form-field-entry, [class*="fieldEntry"]'
              );
              for (const entry of entries) {
                const yesNo = entry.querySelector('[class*="yesno"]');
                if (!yesNo) continue;
                const buttons = [...yesNo.querySelectorAll('button')]
                  .map(b => (b.innerText || '').trim())
                  .filter(t => t === 'Yes' || t === 'No');
                if (new Set(buttons).size < 2) continue;
                const labelEl = entry.querySelector('label');
                const label = (labelEl?.innerText || '').replace(/\\s+/g, ' ').trim();
                if (!label || seen.has(label)) continue;
                seen.add(label);
                out.push(label);
              }
              return out;
            }"""
        )
        fields: list[FormField] = []
        for label in groups:
            fields.append(
                FormField(
                    selector=f"ashby-yesno:{label}",
                    label=label,
                    field_type="radio",
                    required=True,
                    options=["Yes", "No"],
                )
            )
        return fields

    async def _extract_radio_groups(self, page: Page) -> list[FormField]:
        groups = await page.evaluate(
            """() => {
              const byName = {};
              for (const r of document.querySelectorAll('input[type=radio]')) {
                const name = r.name || '';
                if (!name) continue;
                (byName[name] ||= { options: [], label: '' });
                const lab = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
                const text = (lab?.innerText || r.value || '').trim();
                if (text && !byName[name].options.includes(text)) {
                  byName[name].options.push(text);
                }
                if (!byName[name].label) {
                  let n = r.parentElement;
                  for (let i = 0; i < 8 && n; i++) {
                    for (const sel of ['legend', 'label', 'h3', 'h4', 'p']) {
                      const el = n.querySelector(sel);
                      const t = el?.innerText?.trim();
                      if (t && t !== text && t.length > 3) {
                        byName[name].label = t.replace(/\\s+/g, ' ').slice(0, 200);
                        break;
                      }
                    }
                    if (byName[name].label) break;
                    n = n.parentElement;
                  }
                }
              }
              return Object.entries(byName).map(([name, meta]) => ({
                name,
                label: meta.label || name,
                options: meta.options,
              }));
            }"""
        )
        fields: list[FormField] = []
        for group in groups:
            options = group.get("options") or []
            if len(options) < 2:
                continue
            # Skip Yes/No radios already covered by button extractor.
            if set(options) <= {"Yes", "No"}:
                continue
            name = group["name"]
            fields.append(
                FormField(
                    selector=f"ashby-radio:{name}",
                    label=group.get("label") or name,
                    field_type="radio",
                    required=True,
                    options=options,
                )
            )
        return fields

    async def extract_fields(self, page: Page) -> list[FormField]:
        await self.ensure_application_form(page)
        fields: list[FormField] = []
        seen: set[str] = set()

        inputs = await page.query_selector_all(
            "input[type='text'], input[type='email'], input[type='tel'], input[type='url']"
        )
        for inp in inputs:
            inp_id = await inp.get_attribute("id") or ""
            inp_name = await inp.get_attribute("name") or ""
            label_text = await self._get_label_text(page, inp)
            if not label_text:
                continue
            selector = self._field_selector(inp_id, inp_name, "input")
            if not selector or selector in seen:
                continue
            seen.add(selector)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text,
                    field_type="text",
                )
            )

        textareas = await page.query_selector_all("textarea")
        for ta in textareas:
            ta_id = await ta.get_attribute("id") or ""
            ta_name = await ta.get_attribute("name") or ""
            label_text = await self._get_label_text(page, ta)
            if not label_text:
                continue
            selector = self._field_selector(ta_id, ta_name, "textarea")
            if not selector or selector in seen:
                continue
            seen.add(selector)
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text,
                    field_type="textarea",
                    required=True,
                )
            )

        file_inputs = await page.query_selector_all("input[type='file']")
        for fi in file_inputs:
            fi_id = await fi.get_attribute("id") or ""
            selector = self._field_selector(fi_id, "", "input") or "input[type='file']"
            if selector in seen:
                continue
            seen.add(selector)
            label_text = await self._get_label_text(page, fi) or "resume"
            fields.append(
                FormField(
                    selector=selector,
                    label=label_text,
                    field_type="file",
                )
            )

        for field in await self._extract_yes_no_fields(page):
            if field.selector not in seen:
                seen.add(field.selector)
                fields.append(field)

        for field in await self._extract_radio_groups(page):
            if field.selector not in seen:
                seen.add(field.selector)
                fields.append(field)

        logger.info("Ashby: extracted %d fields", len(fields))
        return fields

    async def _click_yes_no(self, page: Page, question: str, value: str) -> bool:
        choice = str(value).strip()
        lowered = choice.lower()
        if lowered in {"true", "1", "y"}:
            choice = "Yes"
        elif lowered in {"false", "0", "n"}:
            choice = "No"
        elif lowered.startswith("yes"):
            choice = "Yes"
        elif lowered.startswith("no"):
            choice = "No"
        elif choice not in {"Yes", "No"}:
            # Common sponsorship / relocate phrasing from LLM literals.
            if "not" in lowered or "no" in lowered:
                choice = "No"
            else:
                choice = "Yes"

        clicked = await page.evaluate(
            """({ question, choice }) => {
              const norm = s => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const q = norm(question);
              const entries = document.querySelectorAll(
                '.ashby-application-form-field-entry, [class*="fieldEntry"]'
              );
              for (const entry of entries) {
                const labelEl = entry.querySelector('label');
                const label = norm(labelEl?.innerText || '');
                if (!label || (!label.includes(q.slice(0, 40)) && !q.includes(label.slice(0, 40)))) {
                  continue;
                }
                const yesNo = entry.querySelector('[class*="yesno"]') || entry;
                const target = [...yesNo.querySelectorAll('button')]
                  .find(b => (b.innerText || '').trim() === choice);
                if (target) {
                  target.click();
                  return true;
                }
              }
              return false;
            }""",
            {"question": question, "choice": choice},
        )
        if clicked:
            await random_pause(0.2, 0.5)
        return bool(clicked)

    async def _click_radio_option(self, page: Page, name: str, value: str) -> bool:
        choice = str(value).strip()
        if choice.lower().startswith("literal:"):
            choice = choice.split(":", 1)[1].strip()

        clicked = await page.evaluate(
            """({ name, choice }) => {
              const radios = [...document.querySelectorAll(`input[type=radio][name="${CSS.escape(name)}"]`)];
              const norm = s => (s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              const want = norm(choice);
              for (const r of radios) {
                const lab = document.querySelector(`label[for="${CSS.escape(r.id)}"]`);
                const text = norm(lab?.innerText || r.value || '');
                if (text === want || text.includes(want) || want.includes(text)) {
                  (lab || r).click();
                  return true;
                }
              }
              if (radios[0]) {
                const lab = document.querySelector(`label[for="${CSS.escape(radios[0].id)}"]`);
                (lab || radios[0]).click();
                return true;
              }
              return false;
            }""",
            {"name": name, "choice": choice},
        )
        if clicked:
            await random_pause(0.2, 0.5)
        return bool(clicked)

    async def _fill_text(self, page: Page, selector: str, value: str) -> None:
        """Type short values human-like; paste long screening answers quickly."""
        text = str(value)
        if len(text) <= 80:
            await human_type(page, selector, text)
            return

        await random_pause(0.2, 0.4)
        element = await page.wait_for_selector(selector, timeout=10_000)
        if element is None:
            return
        await element.click()
        await element.fill(text)
        await random_pause(0.2, 0.4)

    async def _upload_resume(self, page: Page, cv_data: CVData) -> tuple[bool, str | None]:
        """Attach the resume to Ashby's required resume field.

        Ashby also renders an optional "Autofill from resume" file input first.
        The generic uploader can therefore report success while leaving the
        required ``_systemfield_resume`` input empty.
        """
        resume_input = await page.query_selector('[id="_systemfield_resume"]')
        if resume_input is None:
            return False, "Ashby required resume input not found"

        async with prepare_resume_file(cv_data) as resume_path:
            if resume_path is None:
                return False, "Resume file not available for upload"
            await resume_input.set_input_files(str(resume_path))
            uploaded = await resume_input.evaluate(
                "el => Boolean(el.files && el.files.length > 0)"
            )
            if not uploaded:
                return False, "Failed to attach resume to Ashby required resume field"

        logger.info("Ashby: resume attached to required Resume field")
        return True, None

    async def _find_field_by_label(self, page: Page, label: str) -> str | None:
        """Return a CSS selector for an input whose label text matches *label*."""
        for_attr = await page.evaluate(
            """(label) => {
              const want = (label || '').replace(/\\s+/g, ' ').trim().toLowerCase();
              for (const el of document.querySelectorAll('label')) {
                const text = (el.innerText || '').replace(/\\s+/g, ' ').trim().toLowerCase();
                if (text === want || text.includes(want)) {
                  return el.getAttribute('for') || el.control?.id || null;
                }
              }
              return null;
            }""",
            label,
        )
        if for_attr:
            return _css_id_selector(for_attr)
        return None

    async def _fill_identity_fields(self, page: Page, cv_data: CVData) -> int:
        """Deterministically fill core fields instead of relying only on the LLM."""
        linkedin_url = await resolve_linkedin_url(page, cv_data)
        # Keep cv_data in sync so later LLM-mapped LinkedIn fills use the same value.
        cv_data.linkedin_url = linkedin_url

        values = (
            ('[id="_systemfield_name"]', "Name", cv_data.full_name),
            ('[id="_systemfield_email"]', "Email", cv_data.email),
            (None, "LinkedIn Profile", linkedin_url),
        )
        filled = 0
        for selector, label, value in values:
            if not value:
                logger.warning("Ashby: no value available for %s", label)
                continue
            element = await page.query_selector(selector) if selector else None
            if element is None:
                selector = await self._find_field_by_label(page, label)
                if not selector:
                    logger.warning("Ashby: required %s field not found", label)
                    continue

            await self._fill_text(page, selector, str(value))
            actual = await page.input_value(selector)
            if actual.strip():
                filled += 1
                logger.info(
                    "Ashby: verified %s field is populated (%s)",
                    label,
                    actual[:80],
                )
            else:
                logger.warning("Ashby: %s field remained empty after fill", label)
        return filled

    async def _collect_validation_errors(self, page: Page) -> list[str]:
        """Collect visible Ashby validation messages and empty required fields."""
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
                const id = el.id || '';
                const label = id
                  ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.innerText
                  : '';
                const name = (label || el.name || el.placeholder || el.type || 'field')
                  .replace(/\\s+/g, ' ').trim();
                const message = el.validationMessage || 'invalid or required';
                errors.add(`${name}: ${message}`.slice(0, 240));
              }
              return [...errors];
            }"""
        )

    async def _page_looks_successful(self, page: Page) -> bool:
        """Best-effort UI signals that Ashby accepted the application."""
        return await page.evaluate(
            """() => {
              const body = (document.body?.innerText || '').toLowerCase();
              const successPhrases = [
                'thank you for applying',
                'thanks for applying',
                'thanks for your application',
                'thank you for your application',
                'application submitted',
                'application has been submitted',
                'application received',
                'we received your application',
                'successfully submitted',
                'your application is on its way',
                'we got your application',
              ];
              if (successPhrases.some(p => body.includes(p))) return true;

              const submit = [...document.querySelectorAll('button')]
                .find(b => /submit application|submit/i.test((b.innerText || '').trim()));
              const formStillOpen = Boolean(
                document.querySelector('#_systemfield_email, input[type=email]')
              );
              // Success screens often remove the submit CTA and/or the form.
              if (!submit && !formStillOpen) return true;
              if (!submit && body.includes('application')) return true;
              return false;
            }"""
        )

    async def _wait_for_submit_result(
        self, page: Page, *, api_ok: bool = False
    ) -> tuple[bool, str]:
        """Decide whether Ashby accepted the application.

        Ashby often confirms by email and may keep the same ``/application`` URL,
        so URL changes alone are not reliable.
        """
        if api_ok:
            return True, "submit API ok"

        try:
            await page.wait_for_function(
                """() => {
                  const body = (document.body?.innerText || '').toLowerCase();
                  const phrases = [
                    'thank you for applying',
                    'thanks for applying',
                    'thanks for your application',
                    'thank you for your application',
                    'application submitted',
                    'application has been submitted',
                    'application received',
                    'we received your application',
                    'successfully submitted',
                    'your application is on its way',
                    'we got your application',
                  ];
                  if (phrases.some(p => body.includes(p))) return true;
                  const submit = [...document.querySelectorAll('button')]
                    .find(b => /submit application/i.test((b.innerText || '').trim()));
                  const email = document.querySelector('#_systemfield_email, input[type=email]');
                  return !submit && !email;
                }""",
                timeout=8_000,
            )
            return True, "success UI detected"
        except Exception:
            pass

        if await self._page_looks_successful(page):
            return True, "success UI heuristics"

        validation_errors = await self._collect_validation_errors(page)
        if validation_errors:
            return False, "; ".join(validation_errors[:8])

        # No validation errors after submit. Ashby confirms primarily by email,
        # so treat this as success rather than a false failure.
        body_snip = (await page.inner_text("body")).replace("\n", " ").strip()[:240]
        logger.info(
            "Ashby: treating submit as success (no validation errors). page=%r url=%s",
            body_snip,
            page.url,
        )
        return True, "submitted with no validation errors"

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

            # Ensure core identity fields are present even if the LLM omitted or
            # incorrectly mapped them. Later mapped fills may safely overwrite them.
            filled += await self._fill_identity_fields(page, cv_data)

            for selector, cv_key in field_mapping.items():
                value = resolve_mapped_value(cv_data, cv_key)
                if value is None:
                    continue

                if selector.startswith("ashby-yesno:"):
                    question = selector[len("ashby-yesno:") :]
                    if await self._click_yes_no(page, question, str(value)):
                        filled += 1
                        logger.info("Ashby: answered Yes/No for %r -> %s", question[:60], value)
                    else:
                        logger.warning("Ashby: failed Yes/No click for %r", question[:80])
                    continue

                if selector.startswith("ashby-radio:"):
                    name = selector[len("ashby-radio:") :]
                    if await self._click_radio_option(page, name, str(value)):
                        filled += 1
                        logger.info("Ashby: selected radio %s -> %s", name[:36], value)
                    else:
                        logger.warning("Ashby: failed radio select for %s", name[:60])
                    continue

                field_el = await page.query_selector(selector)
                if field_el is None:
                    logger.warning("Ashby: missing field %s", selector)
                    continue

                input_type = await field_el.get_attribute("type") or ""
                if input_type == "file":
                    continue

                await self._fill_text(page, selector, str(value))
                filled += 1

            await random_pause(0.5, 1.0)

            submit_sel = (
                "button:has-text('Submit Application'), "
                "button[type='submit'], "
                "button:has-text('Submit')"
            )
            submit_btn = await page.query_selector(submit_sel)
            if not submit_btn:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error="Ashby submit button not found",
                )

            logger.info("Ashby: clicking submit (%d fields filled)", filled)

            def _is_submit_response(response) -> bool:
                try:
                    if response.request.method.upper() != "POST":
                        return False
                    url = response.url.lower()
                    if not any(
                        token in url
                        for token in (
                            "application",
                            "ashby",
                            "posting",
                            "candidate",
                            "submit",
                        )
                    ):
                        return False
                    return 200 <= response.status < 300
                except Exception:
                    return False

            api_ok = False
            try:
                async with page.expect_response(
                    _is_submit_response, timeout=25_000
                ) as pending:
                    await human_click(page, submit_sel)
                    response = await pending.value
                api_ok = True
                logger.info(
                    "Ashby: submit API succeeded (%s %s)",
                    response.status,
                    response.url[:120],
                )
            except Exception:
                # Click already ran inside the expect block; do not click again
                # (would risk a duplicate application). Fall back to heuristics.
                logger.info(
                    "Ashby: no matching submit API response; using page heuristics"
                )

            success, detail = await self._wait_for_submit_result(page, api_ok=api_ok)
            if not success:
                logger.warning("Ashby validation errors: %s", detail)
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error=f"Ashby submit validation failed: {detail}",
                )

            logger.info(
                "Ashby: filled %d fields and submitted (%s)", filled, detail
            )
            return FillResult(
                success=True, ats_type=self.ats_name, fields_filled=filled
            )

        except Exception as e:
            logger.error("Ashby fill failed: %s", e)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(e),
            )
