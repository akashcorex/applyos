from urllib.parse import urlparse

from models import AtsType, ConfidenceLevel
from services.parsers.base import fetch_text_with_retries_strict

WELLFOUND_HOSTS = frozenset(
    {
        "wellfound.com",
        "angel.co",
        "angelist.com",
    }
)

ATS_SIGNATURES: dict[AtsType, list[str]] = {
    "greenhouse": ["greenhouse.io", "boards.greenhouse.io"],
    "lever": ["lever.co", "jobs.lever.co"],
    "ashby": ["ashbyhq.com", "jobs.ashbyhq.com"],
    "workable": ["workable.com", "apply.workable.com"],
    "recruitee": ["recruitee.com"],
    "personio": ["personio.de", "personio.com", "jobs.personio.de"],
    "wellfound": ["wellfound.com", "angel.co/jobs", "angelist.com/jobs"],
}


def _wellfound_host(host: str) -> bool:
    if host in WELLFOUND_HOSTS:
        return True
    return host.endswith(".wellfound.com")


def detect_ats_from_url(career_page_url: str) -> AtsType | None:
    """Detect ATS from the URL alone (no HTTP fetch).

    Wellfound is detected here because their pages are often blocked to
    server-side fetchers (DataDome/Cloudflare).
    """
    parsed = urlparse(career_page_url)
    host = (parsed.netloc or "").lower().removeprefix("www.")
    path_parts = [part for part in parsed.path.split("/") if part]

    if _wellfound_host(host):
        if len(path_parts) >= 2 and path_parts[0] == "company":
            return "wellfound"
        if path_parts and path_parts[0] == "jobs":
            return "wellfound"

    return None


def detect_ats_from_html(html: str) -> AtsType | None:
    for ats_type, signatures in ATS_SIGNATURES.items():
        if any(signature in html for signature in signatures):
            return ats_type
    return None


def infer_slug_from_url(career_page_url: str, ats_type: AtsType | None) -> str | None:
    if not ats_type:
        return None

    parsed = urlparse(career_page_url)
    host = (parsed.netloc or "").lower().removeprefix("www.")
    path_parts = [part for part in parsed.path.split("/") if part]

    if ats_type == "greenhouse" and "greenhouse.io" in host and path_parts:
        return path_parts[0]
    if ats_type == "lever" and "lever.co" in host and path_parts:
        return path_parts[0]
    if ats_type == "ashby" and "ashbyhq.com" in host and path_parts:
        return path_parts[0]
    if ats_type == "workable":
        # https://jobs.workable.com/company/{companyId}/jobs-at-{slug}
        if host in {"jobs.workable.com", "www.jobs.workable.com"}:
            if len(path_parts) >= 2 and path_parts[0] == "company":
                return path_parts[1]
            return None
        # https://apply.workable.com/{accountSlug}/...
        if host in {"apply.workable.com", "www.apply.workable.com"} and path_parts:
            if path_parts[0] == "j":
                return None
            return path_parts[0]
        if "workable.com" in host and path_parts:
            return path_parts[0]
    if ats_type == "recruitee" and host.endswith(".recruitee.com"):
        return host.removesuffix(".recruitee.com")
    if ats_type == "personio" and host.endswith(".jobs.personio.de"):
        return host.removesuffix(".jobs.personio.de")
    if ats_type == "wellfound" and _wellfound_host(host):
        if len(path_parts) >= 2 and path_parts[0] == "company":
            return path_parts[1]

    return None


async def detect_ats(
    career_page_url: str,
) -> tuple[AtsType | None, str | None, ConfidenceLevel]:
    url_ats_type = detect_ats_from_url(career_page_url)
    if url_ats_type:
        slug = infer_slug_from_url(career_page_url, url_ats_type)
        if slug:
            return url_ats_type, slug, "high"
        return url_ats_type, None, "low"

    html = await fetch_text_with_retries_strict(career_page_url)
    ats_type = detect_ats_from_html(html)
    slug = infer_slug_from_url(career_page_url, ats_type)

    if slug:
        confidence: ConfidenceLevel = "high"
    elif ats_type:
        confidence = "low"
    else:
        confidence = "none"

    return ats_type, slug, confidence
