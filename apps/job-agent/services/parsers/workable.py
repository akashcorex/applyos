from models import RawJob
from services.parsers.base import fetch_json_with_retries

WORKABLE_JOBS_URL = (
    "https://apply.workable.com/api/v3/accounts/{slug}/jobs"
)


class WorkableParser:
    ats_type = "workable"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = WORKABLE_JOBS_URL.format(slug=slug)
        jobs: list[RawJob] = []

        while url:
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

                jobs.append(
                    RawJob(
                        external_id=str(item.get("shortcode", "")),
                        title=str(item.get("title", "")).strip(),
                        department=department,
                        location=location,
                        description_raw=None,
                        description_html=None,
                        workplace_type=item.get("workplace"),
                        raw_payload=item,
                    )
                )

            paging = payload.get("paging", {})
            next_url = None
            if isinstance(paging, dict):
                next_url = paging.get("next")
            url = str(next_url) if next_url else None

        return [job for job in jobs if job.external_id and job.title]
