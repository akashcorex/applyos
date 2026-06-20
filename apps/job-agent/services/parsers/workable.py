import logging
from urllib.parse import urlparse

from config import settings
from models import RawJob
from services.parsers.base import fetch_json_with_retries

logger = logging.getLogger(__name__)

WORKABLE_JOBS_URL = (
    "https://apply.workable.com/api/v3/accounts/{slug}/jobs"
)
WORKABLE_ALLOWED_HOST = "apply.workable.com"


def _validate_workable_next_url(next_url: str | None) -> str | None:
    if not next_url:
        return None

    parsed = urlparse(next_url)
    if parsed.scheme not in ("http", "https"):
        logger.warning("Rejecting Workable next URL with invalid scheme: %s", parsed.scheme)
        return None

    host = (parsed.netloc or "").lower().removeprefix("www.")
    if host != WORKABLE_ALLOWED_HOST:
        logger.warning("Rejecting Workable next URL with invalid host: %s", host)
        return None

    return next_url


class WorkableParser:
    ats_type = "workable"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = WORKABLE_JOBS_URL.format(slug=slug)
        jobs: list[RawJob] = []
        pages_fetched = 0

        while url and pages_fetched < settings.workable_max_pages:
            pages_fetched += 1
            payload = await fetch_json_with_retries(url)

            if not isinstance(payload, dict):
                raise RuntimeError("Unexpected Workable response shape")

            results = payload.get("results", [])
            if not isinstance(results, list):
                raise RuntimeError("Workable results field is not a list")

            for item in results:
                if not isinstance(item, dict):
                    continue

                department = None
                department_obj = item.get("department")
                if isinstance(department_obj, dict):
                    department = department_obj.get("name")

                location = None
                location_obj = item.get("location")
                if isinstance(location_obj, dict):
                    location = location_obj.get("location_str")

                shortcode = str(item.get("shortcode", ""))
                shortlink = item.get("shortlink") or item.get("url")
                application_url = (
                    str(shortlink).strip()
                    if shortlink
                    else f"https://apply.workable.com/{slug}/{shortcode}"
                    if shortcode
                    else None
                )

                jobs.append(
                    RawJob(
                        external_id=shortcode,
                        title=str(item.get("title", "")).strip(),
                        department=department,
                        location=location,
                        description_raw=None,
                        description_html=None,
                        workplace_type=item.get("workplace"),
                        application_url=application_url,
                        raw_payload=item,
                    )
                )

            paging = payload.get("paging", {})
            next_url = None
            if isinstance(paging, dict):
                next_url = paging.get("next")
            url = _validate_workable_next_url(str(next_url) if next_url else None)

        if url and pages_fetched >= settings.workable_max_pages:
            logger.warning(
                "Workable pagination limit reached for slug=%s after %s pages",
                slug,
                pages_fetched,
            )

        return [job for job in jobs if job.external_id and job.title]
