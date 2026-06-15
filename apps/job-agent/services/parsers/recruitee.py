from models import RawJob
from services.parsers.base import fetch_json_with_retries

RECRUITEE_JOBS_URL = "https://{slug}.recruitee.com/api/offers"


def _compose_location(city: str | None, country: str | None) -> str | None:
    parts = [part for part in [city, country] if part]
    return ", ".join(parts) if parts else None


class RecruiteeParser:
    ats_type = "recruitee"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = RECRUITEE_JOBS_URL.format(slug=slug)
        payload = await fetch_json_with_retries(url)

        if not isinstance(payload, dict):
            raise RuntimeError("Unexpected Recruitee response shape")

        offers = payload.get("offers", [])
        if not isinstance(offers, list):
            raise RuntimeError("Recruitee offers field is not a list")

        jobs: list[RawJob] = []
        for item in offers:
            if not isinstance(item, dict):
                continue

            workplace_type = None
            if item.get("remote") is True:
                workplace_type = "remote"
            elif item.get("hybrid") is True:
                workplace_type = "hybrid"
            elif item.get("on_site") is True:
                workplace_type = "onsite"

            jobs.append(
                RawJob(
                    external_id=str(item.get("id", "")),
                    title=str(item.get("title", "")).strip(),
                    department=item.get("department"),
                    location=_compose_location(
                        item.get("city"),
                        item.get("country"),
                    ),
                    description_raw=item.get("description"),
                    description_html=None,
                    workplace_type=workplace_type,
                    raw_payload=item,
                )
            )

        return [job for job in jobs if job.external_id and job.title]
