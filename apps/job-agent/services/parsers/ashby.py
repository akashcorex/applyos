from models import RawJob
from services.dates import parse_posted_at
from services.parsers.base import fetch_json_with_retries

ASHBY_JOBS_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=true"


def _to_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip().replace(",", "")))
        except ValueError:
            return None
    return None


def _parse_compensation(item: dict) -> tuple[int | None, int | None, str | None]:
    comp = item.get("compensation")
    candidates = comp if isinstance(comp, list) else [comp]
    for entry in candidates:
        if not isinstance(entry, dict):
            continue
        salary_min = _to_int(entry.get("minValue", entry.get("min")))
        salary_max = _to_int(entry.get("maxValue", entry.get("max")))
        currency = entry.get("currency") or entry.get("currencyCode")
        if salary_min is not None or salary_max is not None:
            return (
                salary_min,
                salary_max,
                str(currency).upper() if currency else None,
            )
    return None, None, None


def _resolve_location(item: dict) -> str | None:
    location = item.get("location") or item.get("locationName")
    if location:
        return location
    secondary = item.get("secondaryLocations")
    if isinstance(secondary, list) and secondary:
        first = secondary[0]
        if isinstance(first, dict):
            return first.get("locationName") or first.get("location")
        if isinstance(first, str):
            return first
    return None


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
            salary_min, salary_max, currency = _parse_compensation(item)

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=str(item.get("title", "")).strip(),
                    department=item.get("department") or item.get("departmentName"),
                    location=_resolve_location(item),
                    description_raw=None,
                    description_html=item.get("descriptionHtml"),
                    workplace_type=item.get("workplaceType"),
                    application_url=application_url,
                    posted_at=parse_posted_at(
                        item.get("publishedAt") or item.get("openedAt")
                    ),
                    salary_min=salary_min,
                    salary_max=salary_max,
                    salary_currency=currency,
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
