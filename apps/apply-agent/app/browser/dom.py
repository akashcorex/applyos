"""DOM helpers shared by the ATS handlers."""

from __future__ import annotations

from playwright.async_api import ElementHandle, Page


async def first_visible(page: Page, selector: str) -> ElementHandle | None:
    """Return the first visible match for *selector*, else the first match.

    Forms commonly ship a hidden input beside the real control (Lever's
    ``consent[marketing]``). Acting on the hidden twin silently no-ops, so
    prefer whichever match is actually rendered.
    """
    locator = page.locator(selector)
    try:
        count = await locator.count()
    except Exception:
        return await page.query_selector(selector)

    for index in range(count):
        candidate = locator.nth(index)
        try:
            if await candidate.is_visible():
                return await candidate.element_handle()
        except Exception:
            continue

    return await page.query_selector(selector)
