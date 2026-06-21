from __future__ import annotations

import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup

from models import FundedCompany
from services.parsers.base import fetch_text_with_retries
from services.parsers.yc import extract_domain

NEWS_URL = "https://startups.gallery/news"
COMPANY_URL_TEMPLATE = "https://startups.gallery/companies/{slug}"

AMOUNT_ROUND_PATTERN = re.compile(
    r"^\$([\d.]+[BMK]?)\s*·\s*(.+)$",
    re.IGNORECASE,
)


class StartupGalleryParser:
    source = "startups_gallery"

    async def fetch_funded_companies(
        self,
        *,
        enrich_domains: bool = False,
    ) -> list[FundedCompany]:
        html = await fetch_text_with_retries(NEWS_URL)
        companies = _parse_news_page(html)

        if enrich_domains:
            enriched: list[FundedCompany] = []
            for company in companies:
                if company.domain or not company.company_slug:
                    enriched.append(company)
                    continue
                domain = await _fetch_company_domain(company.company_slug)
                enriched.append(company.model_copy(update={"domain": domain}))
            return enriched

        return companies


def _parse_news_page(html: str) -> list[FundedCompany]:
    soup = BeautifulSoup(html, "lxml")
    companies: list[FundedCompany] = []
    seen_slugs: set[str] = set()

    for link in soup.select('a[href*="/companies/"]'):
        href = link.get("href", "")
        slug_match = re.search(r"/companies/([^/?#]+)", href)
        if not slug_match:
            continue

        slug = slug_match.group(1)
        if slug in seen_slugs:
            continue

        row = _find_row_container(link)
        if row is None:
            continue

        parsed = _parse_row(row, slug)
        if parsed is None:
            continue

        seen_slugs.add(slug)
        companies.append(parsed)

    return companies


def _find_row_container(link) -> object | None:
    current = link
    for _ in range(8):
        if current.parent is None:
            break
        current = current.parent
        if current.select_one('[data-framer-name="Amount"]'):
            return current
    return None


def _parse_row(row, slug: str) -> FundedCompany | None:
    name = _extract_company_name(row, slug)
    amount_text = _text_for_framer_name(row, "Amount")
    date_text = _date_for_framer_name(row)
    lead_investor = _extract_lead_investor(row)
    press_url = _extract_press_url(row)

    if not name or not amount_text:
        return None

    amount, round_name = _split_amount_round(amount_text)
    domain = _domain_from_press_url(press_url)

    return FundedCompany(
        name=name,
        domain=domain,
        round=round_name or "unknown",
        amount=amount,
        announced_date=date_text,
        lead_investor=lead_investor,
        press_url=press_url,
        source="startups_gallery",
        company_slug=slug,
    )


def _extract_company_name(row, slug: str) -> str | None:
    company_link = row.select_one(f'a[href*="/companies/{slug}"]')
    if company_link is None:
        return None

    name = company_link.get_text(strip=True)
    if name:
        return name

    paragraph = company_link.select_one("p")
    if paragraph is not None:
        return paragraph.get_text(strip=True) or None

    return slug.replace("-", " ").title()


def _text_for_framer_name(row, name: str) -> str | None:
    container = row.select_one(f'[data-framer-name="{name}"]')
    if container is None:
        return None
    return container.get_text(strip=True) or None


def _date_for_framer_name(row) -> str | None:
    container = row.select_one('[data-framer-name="Date"]')
    if container is None:
        return None

    time_tag = container.find("time")
    if time_tag is not None:
        datetime_value = time_tag.get("datetime")
        if datetime_value:
            return datetime_value[:10]
        text = time_tag.get_text(strip=True)
        return text or None

    return container.get_text(strip=True) or None


def _extract_lead_investor(row) -> str | None:
    investor_link = row.select_one('a[href*="/investors/"]')
    if investor_link is None:
        return None

    alt_text = investor_link.get("alt", "")
    if alt_text.startswith("Logo of "):
        return alt_text.removeprefix("Logo of ").strip() or None

    image = investor_link.find("img")
    if image is not None:
        alt = image.get("alt", "")
        if alt.startswith("Logo of "):
            return alt.removeprefix("Logo of ").strip() or None

    slug_match = re.search(r"/investors/([^/?#]+)", investor_link.get("href", ""))
    if slug_match:
        return slug_match.group(1).replace("-", " ").title()

    return None


def _extract_press_url(row) -> str | None:
    source_link = row.select_one('[data-framer-name="Source"]')
    if source_link is None:
        return None

    href = source_link.get("href")
    if href and href.startswith("http"):
        return href

    nested = source_link.select_one("a[href]")
    if nested is not None:
        href = nested.get("href")
        if href and href.startswith("http"):
            return href

    return None


def _split_amount_round(amount_text: str) -> tuple[str | None, str | None]:
    match = AMOUNT_ROUND_PATTERN.match(amount_text.strip())
    if not match:
        return amount_text.strip(), None

    amount_value, round_name = match.groups()
    return f"${amount_value}", round_name.strip()


def _domain_from_press_url(press_url: str | None) -> str | None:
    if not press_url:
        return None

    host = urlparse(press_url).netloc.lower().removeprefix("www.")
    blocked_hosts = {
        "x.com",
        "twitter.com",
        "www.finsmes.com",
        "finsmes.com",
        "techcrunch.com",
        "www.prnewswire.com",
        "prnewswire.com",
        "www.businesswire.com",
        "businesswire.com",
        "www.forbes.com",
        "forbes.com",
        "finance.yahoo.com",
        "www.linkedin.com",
        "linkedin.com",
    }
    if host in blocked_hosts:
        return None

    return host or None


async def _fetch_company_domain(slug: str) -> str | None:
    url = COMPANY_URL_TEMPLATE.format(slug=slug)
    try:
        html = await fetch_text_with_retries(url)
    except RuntimeError:
        return None

    soup = BeautifulSoup(html, "lxml")
    for link in soup.select("a[href]"):
        href = link.get("href", "")
        if not href.startswith("http"):
            continue

        parsed = urlparse(href)
        host = parsed.netloc.lower().removeprefix("www.")
        if host in {"startups.gallery", "framer.com", "framerusercontent.com"}:
            continue
        if "greenhouse.io" in host or "lever.co" in host or "ashbyhq.com" in host:
            continue
        if host.endswith(".jobs.personio.de") or host.endswith(".recruitee.com"):
            continue

        return extract_domain(href)

    return None
