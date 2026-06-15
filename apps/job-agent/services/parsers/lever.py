from models import RawJob
from services.parsers.base import fetch_json_with_retries

LEVER_JOBS_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"


class LeverParser:
    ats_type = "lever"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = LEVER_JOBS_URL.format(slug=slug)
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, list):
            raise RuntimeError("Unexpected Lever response shape")

        jobs: list[RawJob] = []
        for item in payload:
            if not isinstance(item, dict):
                continue

            categories = item.get("categories", {})
            department = None
            location = None
            if isinstance(categories, dict):
                department = categories.get("team") or categories.get("department")
                location = categories.get("location")

            jobs.append(
                RawJob(
                    external_id=str(item.get("id", "")),
                    title=str(item.get("text", "")).strip(),
                    department=department,
                    location=location,
                    description_raw=item.get("descriptionPlain"),
                    description_html=item.get("description"),
                    workplace_type=item.get("workplaceType"),
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
