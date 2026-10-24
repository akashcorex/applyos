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


async def safe_click(element, *, timeout: int = 5_000, force: bool = False) -> bool:
    """Click an element, falling back to a JS click when input dispatch stalls.

    Some engines never acknowledge a CDP click on heavy React widgets; the
    DOM-level click still fires the handler, so it is a usable fallback.
    """
    try:
        await element.click(timeout=timeout, force=force)
        return True
    except Exception:
        pass
    try:
        await element.evaluate("el => el.click()")
        return True
    except Exception:
        return False
