from models import RawJob
from services.parsers.base import fetch_json_with_retries

GREENHOUSE_JOBS_URL = "https://api.greenhouse.io/v1/boards/{slug}/jobs"


def _strip_html(html: str) -> str:
    import re

    return re.sub(r"<[^>]+>", " ", html)


class GreenhouseParser:
    ats_type = "greenhouse"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = f"{GREENHOUSE_JOBS_URL.format(slug=slug)}?content=true"
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Greenhouse response shape")

        jobs_payload = payload.get("jobs", [])
        if not isinstance(jobs_payload, list):
            raise RuntimeError("Greenhouse jobs field is not a list")

        jobs: list[RawJob] = []
        for item in jobs_payload:
            if not isinstance(item, dict):
                continue

            departments = item.get("departments", [])
            department = None
            if isinstance(departments, list) and departments:
                first = departments[0]
                if isinstance(first, dict):
                    department = first.get("name")

            location = None
            location_obj = item.get("location")
            if isinstance(location_obj, dict):
                location = location_obj.get("name")

            external_id = str(item.get("id", ""))
            absolute_url = item.get("absolute_url")
            application_url = (
                str(absolute_url).strip()
                if absolute_url
                else f"https://boards.greenhouse.io/{slug}/jobs/{external_id}"
                if external_id
                else None
            )

            content = item.get("content")
            description_html = str(content).strip() if content else None
            description_raw = _strip_html(description_html).strip() if description_html else None

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=str(item.get("title", "")).strip(),
                    department=department,
                    location=location,
                    description_raw=description_raw or None,
                    description_html=description_html,
                    workplace_type=None,
                    application_url=application_url,
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
