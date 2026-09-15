from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries

ASHBY_JOBS_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"


class AshbyParser:
    ats_type = "ashby"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = ASHBY_JOBS_URL.format(slug=slug)
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Ashby response shape")

        jobs_payload = payload.get("jobs", [])
        if not isinstance(jobs_payload, list):
            raise RuntimeError("Ashby jobs field is not a list")

        jobs: list[RawJob] = []
        for item in jobs_payload:
            if not isinstance(item, dict):
                continue

            if item.get("isListed") is False:
                continue

            external_id = str(item.get("id", ""))
            job_url = item.get("jobUrl") or item.get("applyUrl")
            application_url = (
                str(job_url).strip()
                if job_url
                else f"https://jobs.ashbyhq.com/{slug}/{external_id}"
                if external_id
                else None
            )

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=str(item.get("title", "")).strip(),
                    department=item.get("department") or item.get("departmentName"),
                    location=item.get("location") or item.get("locationName"),
                    description_raw=None,
                    description_html=item.get("descriptionHtml"),
                    workplace_type=item.get("workplaceType"),
                    application_url=application_url,
                    posted_at=parse_posted_at(
                        item.get("publishedAt") or item.get("openedAt")
                    ),
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
