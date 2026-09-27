from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries

BREEZY_JOBS_URL = "https://{slug}.breezy.hr/json"


def _compose_location(item: dict) -> str | None:
    location = item.get("location")
    if isinstance(location, dict) and location.get("name"):
        return str(location["name"])
    parts = [
        item.get("city"),
        item.get("state"),
        item.get("country"),
    ]
    joined = ", ".join(str(part).strip() for part in parts if part)
    if item.get("is_remote") and "remote" not in joined.lower():
        joined = f"{joined} (Remote)" if joined else "Remote"
    return joined or None


class BreezyParser:
    ats_type = "breezy"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = BREEZY_JOBS_URL.format(slug=slug)
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, list):
            raise RuntimeError("Unexpected Breezy response shape")

        jobs: list[RawJob] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            title = str(item.get("name", "")).strip()
            url_value = item.get("url")
            application_url = str(url_value).strip() if url_value else None
            external_id = str(
                item.get("id") or item.get("guid") or application_url or ""
            )
            if not title or not external_id:
                continue

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=title,
                    department=item.get("department"),
                    location=_compose_location(item),
                    description_raw=item.get("description"),
                    description_html=None,
                    workplace_type="remote" if item.get("is_remote") else None,
                    application_url=application_url,
                    posted_at=parse_posted_at(item.get("published_date")),
                    raw_payload=item,
                )
            )

        return jobs
