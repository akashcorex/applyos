from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries

LEVER_JOBS_URL = "https://api.lever.co/v0/postings/{slug}?mode=json"
LEVER_EU_JOBS_URL = "https://api.eu.lever.co/v0/postings/{slug}?mode=json"


class LeverParser:
    ats_type = "lever"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        try:
            payload = await fetch_json_with_retries(LEVER_JOBS_URL.format(slug=slug))
        except Exception:
            payload = await fetch_json_with_retries(
                LEVER_EU_JOBS_URL.format(slug=slug)
            )

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

            external_id = str(item.get("id", ""))
            hosted_url = item.get("hostedUrl") or item.get("applyUrl")
            application_url = (
                str(hosted_url).strip()
                if hosted_url
                else f"https://jobs.lever.co/{slug}/{external_id}"
                if external_id
                else None
            )

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=str(item.get("text", "")).strip(),
                    department=department,
                    location=location,
                    description_raw=item.get("descriptionPlain"),
                    description_html=item.get("description"),
                    workplace_type=item.get("workplaceType"),
                    application_url=application_url,
                    posted_at=parse_posted_at(item.get("createdAt")),
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
