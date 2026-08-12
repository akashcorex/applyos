"""Wellfound (formerly AngelList Talent) apply handler.

Wellfound listings at ``wellfound.com/jobs/<id>-<slug>`` either:

1. **External ATS** — ``applyUrl`` / ``atsUrl`` in Apollo state → redirect and
   let Greenhouse/Lever/etc. handlers take over.
2. **Native apply** — logged-in modal: optional cover note + screening questions
   → ``Send application`` (uses the candidate's Wellfound profile + resume).
"""

from __future__ import annotations

import logging
import re

from playwright.async_api import Page

from app.ats.base import ATSHandler, FillResult, FormField, resolve_mapped_value
from app.browser.human_delay import random_pause
from app.browser.session_manager import is_wellfound_login_url
from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

_JOB_ID_RE = re.compile(r"wellfound\.com/jobs/(\d+)", re.I)

_APPLY_BUTTON = (
    "button:has-text('Apply'):not(:has-text('Easy Apply')), "
    "a:has-text('Apply'):not(:has-text('Easy Apply'))"
)
_MODAL = "[role='dialog']"
_NOTE_SELECTORS = (
    "[role='dialog'] textarea, "
    "textarea[name*='note' i], "
    "textarea[placeholder*='note' i], "
    "textarea[placeholder*='introduction' i], "
    "textarea[placeholder*='cover' i]"
)
_SUBMIT_SELECTORS = (
    "button:has-text('Send application'), "
    "button:has-text('Send Application'), "
    "button:has-text('Submit application')"
)
_SUCCESS_PATTERNS = (
    "application sent",
    "applied successfully",
    "your application has been sent",
    "already applied",
)


class WellfoundHandler(ATSHandler):
    ats_name = "wellfound"

    async def detect(self, page: Page) -> bool:
        url = page.url.lower()
        return "wellfound.com" in url or (
            "angel.co" in url and "/jobs" in url
        )

    def job_listing_id_from_url(self, url: str) -> str | None:
        match = _JOB_ID_RE.search(url)
        return match.group(1) if match else None

    async def _read_apollo_state(self, page: Page) -> dict:
        return await page.evaluate(
            """() => {
              const el = document.getElementById('__NEXT_DATA__');
              if (!el) return {};
              try {
                return JSON.parse(el.textContent)
                  .props.pageProps.apolloState?.data || {};
              } catch (e) {
                return {};
              }
            }"""
        )

    async def resolve_external_apply_url(
        self, page: Page, job_url: str
    ) -> str | None:
        """Return company ATS URL when Wellfound only lists the job externally."""
        job_id = self.job_listing_id_from_url(job_url)
        external = await page.evaluate(
            """({ jobId }) => {
              const el = document.getElementById('__NEXT_DATA__');
              if (!el) return null;
              let graph = {};
              try {
                graph = JSON.parse(el.textContent)
                  .props.pageProps.apolloState?.data || {};
              } catch (e) {
                return null;
              }

              const unpack = (node) => {
                if (node && typeof node === 'object' && node.type === 'id' && node.id) {
                  return unpack(graph[node.id]);
                }
                if (Array.isArray(node)) return node.map(unpack);
                if (node && typeof node === 'object') {
                  const out = {};
                  for (const k of Object.keys(node)) out[k] = unpack(node[k]);
                  return out;
                }
                return node;
              };

              let listing = null;
              for (const [key, val] of Object.entries(graph)) {
                if (!key.startsWith('JobListing')) continue;
                const node = unpack(val);
                if (!node || node.id == null) continue;
                if (String(node.id) === String(jobId)) {
                  listing = node;
                  break;
                }
              }
              if (!listing) return null;

              const candidates = [
                listing.applyUrl,
                listing.atsUrl,
                listing.externalApplyUrl,
                listing.companyApplyUrl,
                listing.applicationUrl,
              ].filter(Boolean);

              for (const url of candidates) {
                const lower = String(url).toLowerCase();
                if (lower.startsWith('http') && !lower.includes('wellfound.com')) {
                  return url;
                }
              }
              return null;
            }""",
            {"jobId": job_id or ""},
        )
        if external:
            logger.info("Wellfound: external apply URL found: %s", external[:120])
        return external

    async def _already_applied(self, page: Page, job_url: str) -> bool:
        job_id = self.job_listing_id_from_url(job_url)
        return bool(
            await page.evaluate(
                """({ jobId }) => {
                  const el = document.getElementById('__NEXT_DATA__');
                  if (!el || !jobId) return false;
                  try {
                    const graph = JSON.parse(el.textContent)
                      .props.pageProps.apolloState?.data || {};
                    for (const [key, val] of Object.entries(graph)) {
                      if (!key.startsWith('JobListing')) continue;
                      if (String(val?.id) === String(jobId) && val?.currentUserApplied) {
                        return true;
                      }
                    }
                  } catch (e) {}
                  const body = (document.body?.innerText || '').toLowerCase();
                  return body.includes('already applied');
                }""",
                {"jobId": job_id or ""},
            )
        )

    async def _open_apply_modal(self, page: Page) -> bool:
        """Click the job-page Apply button (not one-click Easy Apply)."""
        modal = await page.query_selector(_MODAL)
        if modal is not None and await modal.is_visible():
            return True

        for sel in _APPLY_BUTTON.split(", "):
            loc = page.locator(sel.strip()).first
            try:
                if await loc.count() == 0 or not await loc.is_visible():
                    continue
                text = (await loc.inner_text()).lower()
                if "easy apply" in text:
                    continue
                await loc.click(timeout=5_000)
                await random_pause(0.5, 1.0)
                break
            except Exception:
                continue

        try:
            await page.wait_for_selector(_MODAL, state="visible", timeout=8_000)
            return True
        except Exception:
            logger.warning("Wellfound: apply modal did not open")
            return False

    async def extract_fields(self, page: Page) -> list[FormField]:
        if is_wellfound_login_url(page.url):
            return []

        if not await self._open_apply_modal(page):
            return []

        fields: list[FormField] = []
        note = page.locator(_NOTE_SELECTORS).first
        if await note.count():
            fields.append(
                FormField(
                    selector=_NOTE_SELECTORS,
                    label="Application note (cover letter)",
                    field_type="textarea",
                    required=False,
                )
            )

        # Screening questions inside the modal.
        metas = await page.evaluate(
            """() => {
              const dialog = document.querySelector('[role="dialog"]');
              if (!dialog) return [];
              const out = [];
              const seen = new Set();
              for (const el of dialog.querySelectorAll(
                'input:not([type=hidden]):not([type=file]), textarea, select'
              )) {
                const tag = el.tagName.toLowerCase();
                const type = (el.type || '').toLowerCase();
                if (type === 'file') continue;
                const id = el.id || '';
                const name = el.name || '';
                const key = id || name || el.getAttribute('data-test') || '';
                if (!key || seen.has(key)) continue;
                seen.add(key);
                let label = '';
                if (id) {
                  label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
                    ?.innerText || '';
                }
                if (!label) {
                  label = el.getAttribute('aria-label')
                    || el.closest('label')?.innerText
                    || el.placeholder
                    || name
                    || id;
                }
                label = (label || key).replace(/\\s+/g, ' ').trim();
                const required = Boolean(
                  el.required || el.getAttribute('aria-required') === 'true'
                );
                let selector = '';
                if (id) selector = `#${CSS.escape(id)}`;
                else if (name) selector = `${tag}[name="${name}"]`;
                else continue;
                out.push({
                  selector,
                  label,
                  tag,
                  type,
                  required,
                  options: tag === 'select'
                    ? [...el.querySelectorAll('option')].map(o => o.innerText.trim())
                    : null,
                });
              }
              return out;
            }"""
        )

        note_sel = _NOTE_SELECTORS
        for meta in metas:
            if meta["selector"] in note_sel:
                continue
            if "note" in meta["label"].lower() and meta["tag"] == "textarea":
                continue
            ftype = meta["tag"]
            if meta["type"] == "checkbox":
                ftype = "checkbox"
            elif meta["tag"] == "select":
                ftype = "select"
            elif meta["tag"] == "textarea":
                ftype = "textarea"
            else:
                ftype = "text"
            fields.append(
                FormField(
                    selector=meta["selector"],
                    label=meta["label"],
                    field_type=ftype,
                    required=bool(meta["required"]),
                    options=meta.get("options") or None,
                )
            )

        logger.info("Wellfound: extracted %d modal fields", len(fields))
        return fields

    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        filled = 0
        try:
            if is_wellfound_login_url(page.url):
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    error=(
                        "Wellfound login required — run "
                        "scripts/bootstrap_wellfound_session.py --user-id <USER_ID>"
                    ),
                )

            if await self._already_applied(page, page.url):
                return FillResult(
                    success=True,
                    ats_type=self.ats_name,
                    fields_filled=0,
                    error=None,
                )

            if not await self._open_apply_modal(page):
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    error="Wellfound apply modal could not be opened",
                )

            default_note = (
                cv_data.summary
                or (
                    f"Hi — I'm excited about this role at your company. "
                    f"My background in {', '.join(cv_data.skills[:3]) or 'software'} "
                    f"is a strong fit and I'd love to contribute."
                )
            )

            for selector, cv_key in field_mapping.items():
                value = resolve_mapped_value(cv_data, cv_key)
                if value is None and "note" not in selector.lower():
                    continue
                if value is None:
                    value = default_note

                if selector == _NOTE_SELECTORS or "textarea" in selector:
                    loc = page.locator(_NOTE_SELECTORS).first
                    if await loc.count():
                        await loc.fill(str(value))
                        filled += 1
                        logger.info("Wellfound: filled application note")
                    continue

                field_el = await page.query_selector(selector)
                if field_el is None:
                    continue
                tag = await field_el.evaluate("el => el.tagName.toLowerCase()")
                input_type = (await field_el.get_attribute("type") or "").lower()

                if input_type == "checkbox":
                    if str(value).lower() in {"yes", "true", "1", "on"}:
                        await field_el.check(force=True)
                        filled += 1
                elif tag == "select":
                    await field_el.select_option(label=str(value))
                    filled += 1
                else:
                    await field_el.fill(str(value))
                    filled += 1

            # Default note when LLM did not map it.
            if filled == 0 or not any(
                "note" in k.lower() for k in field_mapping
            ):
                loc = page.locator(_NOTE_SELECTORS).first
                if await loc.count():
                    current = (await loc.input_value()).strip()
                    if not current:
                        await loc.fill(default_note)
                        filled += 1
                        logger.info("Wellfound: filled default application note")

            await random_pause(0.3, 0.6)

            submitted = False
            for sel in _SUBMIT_SELECTORS.split(", "):
                btn = page.locator(sel.strip()).first
                try:
                    if await btn.count() == 0 or not await btn.is_visible():
                        continue
                    await btn.click(timeout=5_000)
                    submitted = True
                    logger.info("Wellfound: clicked Send application")
                    break
                except Exception:
                    continue

            if not submitted:
                return FillResult(
                    success=False,
                    ats_type=self.ats_name,
                    fields_filled=filled,
                    error="Wellfound Send application button not found",
                )

            await random_pause(1.0, 2.0)
            body = (await page.inner_text("body")).lower()
            if any(p in body for p in _SUCCESS_PATTERNS):
                return FillResult(
                    success=True, ats_type=self.ats_name, fields_filled=filled
                )

            if await self._already_applied(page, page.url):
                return FillResult(
                    success=True, ats_type=self.ats_name, fields_filled=filled
                )

            # Modal closed without explicit error → treat as success.
            modal = await page.query_selector(_MODAL)
            if modal is None or not await modal.is_visible():
                return FillResult(
                    success=True, ats_type=self.ats_name, fields_filled=filled
                )

            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error="Wellfound submit did not show confirmation",
            )

        except Exception as exc:
            logger.error("Wellfound apply failed: %s", exc)
            return FillResult(
                success=False,
                ats_type=self.ats_name,
                fields_filled=filled,
                error=str(exc),
            )
