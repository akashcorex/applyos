from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries

RIPPLING_JOBS_URL = "https://ats.rippling.com/api/v2/board/{slug}/jobs?page={page}"
RIPPLING_MAX_PAGES = 10
RIPPLING_PAGE_SIZE = 1000


class RipplingParser:
    ats_type = "rippling"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        jobs: list[RawJob] = []
        for page in range(RIPPLING_MAX_PAGES):
            url = RIPPLING_JOBS_URL.format(slug=slug, page=page)
            payload = await fetch_json_with_retries(url)
            if not isinstance(payload, dict):
                raise RuntimeError("Unexpected Rippling response shape")
            items = payload.get("items", [])
            if not isinstance(items, list) or not items:
                break
            for item in items:
                if not isinstance(item, dict):
                    continue
                external_id = str(item.get("id", ""))
                title = str(item.get("name", "")).strip()
                if not external_id or not title:
                    continue
                department = item.get("department")
                department_name = (
                    department.get("name")
                    if isinstance(department, dict)
                    else department
                    if isinstance(department, str)
                    else None
                )
                location = item.get("location")
                if location is None and isinstance(item.get("locations"), list):
                    first_location = next(
                        (
                            entry
                            for entry in item["locations"]
                            if isinstance(entry, dict)
                        ),
                        None,
                    )
                    location = first_location.get("name") if first_location else None
                location_name = (
                    location.get("name")
                    if isinstance(location, dict)
                    else location
                    if isinstance(location, str)
                    else None
                )
                job_url = item.get("url")
                jobs.append(
                    RawJob(
                        external_id=external_id,
                        title=title,
                        department=department_name,
                        location=location_name,
                        description_raw=item.get("description"),
                        description_html=None,
                        workplace_type=None,
                        application_url=str(job_url).strip() if job_url else None,
                        posted_at=parse_posted_at(
                            item.get("publishedAt") or item.get("createdAt")
                        ),
                        raw_payload=item,
                    )
                )
            if len(items) < RIPPLING_PAGE_SIZE:
                break
        return jobs
