"""Discover employees on a LinkedIn company People page."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from urllib.parse import quote_plus

from playwright.async_api import Page

from app.browser.human_delay import human_click, human_scroll, random_pause
from app.browser.session_manager import is_linkedin_login_url

logger = logging.getLogger(__name__)

_PROFILE_HREF_RE = re.compile(r"^https?://(?:www\.)?linkedin\.com/in/[^/?#]+", re.I)


class CompanyPeopleError(Exception):
    """Raised when company/people discovery cannot proceed."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class DiscoveredEmployee:
    name: str
    title: str | None
    profile_url: str


def _normalize_profile_url(href: str) -> str | None:
    if not href:
        return None
    # Relative /in/... links
    if href.startswith("/in/"):
        href = f"https://www.linkedin.com{href.split('?')[0]}"
    match = _PROFILE_HREF_RE.match(href.split("?")[0])
    if not match:
        return None
    return match.group(0).rstrip("/")


async def _ensure_logged_in(page: Page) -> None:
    if is_linkedin_login_url(page.url):
        raise CompanyPeopleError("login_required", "LinkedIn session is not authenticated")


async def _open_company_from_search(page: Page, company_name: str) -> None:
    """Search LinkedIn for the company and open the first company result."""
    query = quote_plus(company_name)
    search_url = f"https://www.linkedin.com/search/results/companies/?keywords={query}"
    await page.goto(search_url, wait_until="domcontentloaded", timeout=45_000)
    await random_pause(2.0, 3.5)
    await _ensure_logged_in(page)

    # First company card link
    company_link = await page.query_selector(
        "a[href*='/company/']:not([href*='/search'])"
    )
    if not company_link:
        # Fallback: any result title linking to /company/
        company_link = await page.query_selector(
            "div.entity-result a[href*='/company/'], "
            "ul.reusable-search__entity-result-list a[href*='/company/']"
        )
    if not company_link:
        raise CompanyPeopleError(
            "company_not_found",
            f"No LinkedIn company results for '{company_name}'",
        )

    href = await company_link.get_attribute("href")
    if not href:
        raise CompanyPeopleError("company_not_found", "Company result missing href")

    if href.startswith("/"):
        href = f"https://www.linkedin.com{href}"
    # Prefer company home, then people tab
    company_base = href.split("?")[0].rstrip("/")
    if not company_base.endswith("/people"):
        # Strip trailing path segments after /company/slug
        parts = company_base.split("/company/")
        if len(parts) == 2:
            slug = parts[1].split("/")[0]
            company_base = f"https://www.linkedin.com/company/{slug}"

    people_url = f"{company_base}/people/"
    await page.goto(people_url, wait_until="domcontentloaded", timeout=45_000)
    await random_pause(2.0, 4.0)
    await _ensure_logged_in(page)


async def _collect_people_from_page(page: Page, limit: int) -> list[DiscoveredEmployee]:
    await human_scroll(page, 400)
    await random_pause(1.0, 2.0)

    employees: list[DiscoveredEmployee] = []
    seen: set[str] = set()

    # Company People cards + search-style entity results
    cards = await page.query_selector_all(
        "li.org-people-profile-card__profile-card-spacing, "
        "div.org-people-profile-card, "
        "li.reusable-search__result-container, "
        "div.entity-result"
    )

    for card in cards:
        if len(employees) >= limit:
            break

        link = await card.query_selector("a[href*='/in/']")
        if not link:
            continue
        href = await link.get_attribute("href")
        profile_url = _normalize_profile_url(href or "")
        if not profile_url or profile_url in seen:
            continue

        name = (await link.inner_text()).strip()
        # Prefer aria-label / nested name spans when link text is noisy
        name_el = await card.query_selector(
            "span.entity-result__title-text a span[aria-hidden='true'], "
            ".artdeco-entity-lockup__title, "
            ".org-people-profile-card__profile-title"
        )
        if name_el:
            candidate = (await name_el.inner_text()).strip()
            if candidate:
                name = candidate

        if not name or name.lower() == "linkedin member":
            name = name or "LinkedIn Member"

        title: str | None = None
        title_el = await card.query_selector(
            ".entity-result__primary-subtitle, "
            ".artdeco-entity-lockup__subtitle, "
            ".org-people-profile-card__profile-info-item, "
            "div.t-14.t-black--light"
        )
        if title_el:
            title = (await title_el.inner_text()).strip() or None

        seen.add(profile_url)
        employees.append(
            DiscoveredEmployee(name=name, title=title, profile_url=profile_url)
        )

    # Last resort: any /in/ links on the people page
    if not employees:
        links = await page.query_selector_all("a[href*='/in/']")
        for link in links:
            if len(employees) >= limit:
                break
            href = await link.get_attribute("href")
            profile_url = _normalize_profile_url(href or "")
            if not profile_url or profile_url in seen:
                continue
            name = (await link.inner_text()).strip() or "LinkedIn Member"
            if len(name) > 80:
                continue
            seen.add(profile_url)
            employees.append(
                DiscoveredEmployee(name=name, title=None, profile_url=profile_url)
            )

    return employees[:limit]


async def discover_company_employees(
    page: Page,
    company_name: str,
    *,
    limit: int = 3,
) -> list[DiscoveredEmployee]:
    """Find up to *limit* employees currently listed for *company_name* on LinkedIn.

    Raises:
        CompanyPeopleError: with code ``login_required``, ``company_not_found``,
            or ``no_people``.
    """
    if limit <= 0:
        return []

    logger.info("Discovering up to %d employees at company=%s", limit, company_name)
    await _open_company_from_search(page, company_name)

    # Try clicking People tab if we landed on company home
    people_tab = await page.query_selector(
        "a[href*='/people']:has-text('People'), "
        "nav a[href*='/people']"
    )
    if people_tab:
        await human_click(
            page,
            "a[href*='/people']:has-text('People'), nav a[href*='/people']",
        )
        await random_pause(2.0, 3.5)

    employees = await _collect_people_from_page(page, limit)
    if not employees:
        raise CompanyPeopleError(
            "no_people",
            f"No employees found on LinkedIn People page for '{company_name}'",
        )

    logger.info(
        "Discovered %d employees for company=%s",
        len(employees),
        company_name,
    )
    return employees
