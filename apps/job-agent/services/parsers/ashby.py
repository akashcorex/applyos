from models import RawJob
from services.parsers.base import fetch_json_with_retries

ASHBY_JOBS_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"


class AshbyParser:
    ats_type = "ashby"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = ASHBY_JOBS_URL.format(slug=slug)
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Ashby response shape")

        jobs_payload = payload.get("jobPostings", [])
        if not isinstance(jobs_payload, list):
            raise RuntimeError("Ashby jobPostings field is not a list")

        jobs: list[RawJob] = []
        for item in jobs_payload:
            if not isinstance(item, dict):
                continue

            if item.get("isListed") is False:
                continue

            jobs.append(
                RawJob(
                    external_id=str(item.get("id", "")),
                    title=str(item.get("title", "")).strip(),
                    department=item.get("departmentName"),
                    location=item.get("locationName"),
                    description_raw=None,
                    description_html=item.get("descriptionHtml"),
                    workplace_type=None,
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
