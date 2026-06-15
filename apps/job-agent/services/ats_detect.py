from urllib.parse import urlparse

from models import AtsType, ConfidenceLevel
from services.parsers.base import fetch_text_with_retries

ATS_SIGNATURES: dict[AtsType, list[str]] = {
    "greenhouse": ["greenhouse.io", "boards.greenhouse.io"],
    "lever": ["lever.co", "jobs.lever.co"],
    "ashby": ["ashbyhq.com", "jobs.ashbyhq.com"],
    "workable": ["workable.com", "apply.workable.com"],
    "recruitee": ["recruitee.com"],
    "personio": ["personio.de", "personio.com", "jobs.personio.de"],
}


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
    if ats_type == "workable" and "workable.com" in host and path_parts:
        return path_parts[0]
    if ats_type == "recruitee" and host.endswith(".recruitee.com"):
        return host.removesuffix(".recruitee.com")
    if ats_type == "personio" and host.endswith(".jobs.personio.de"):
        return host.removesuffix(".jobs.personio.de")

    return None


async def detect_ats(
    career_page_url: str,
) -> tuple[AtsType | None, str | None, ConfidenceLevel]:
    html = await fetch_text_with_retries(career_page_url)
    ats_type = detect_ats_from_html(html)
    slug = infer_slug_from_url(career_page_url, ats_type)

    if slug:
        confidence: ConfidenceLevel = "high"
    elif ats_type:
        confidence = "low"
    else:
        confidence = "none"

    return ats_type, slug, confidence
