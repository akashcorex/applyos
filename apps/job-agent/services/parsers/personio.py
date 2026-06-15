import defusedxml.ElementTree as ET

from models import RawJob
from services.parsers.base import fetch_text_with_retries

PERSONIO_JOBS_URL = "https://{slug}.jobs.personio.de/xml"


def _text(element: ET.Element | None) -> str | None:
    if element is None or element.text is None:
        return None
    value = element.text.strip()
    return value or None


class PersonioParser:
    ats_type = "personio"

    async def fetch_jobs(self, slug: str) -> list[RawJob]:
        url = PERSONIO_JOBS_URL.format(slug=slug)
        xml_text = await fetch_text_with_retries(url)
        root = ET.fromstring(xml_text)

        jobs: list[RawJob] = []
        for position in root.findall("position"):
            external_id = _text(position.find("id"))
            title = _text(position.find("name"))
            if not external_id or not title:
                continue

            raw_payload = {
                "id": external_id,
                "name": title,
                "department": _text(position.find("department")),
                "office": _text(position.find("office")),
                "description": _text(position.find("description")),
            }

            jobs.append(
                RawJob(
                    external_id=external_id,
                    title=title,
                    department=raw_payload["department"],
                    location=raw_payload["office"],
                    description_raw=raw_payload["description"],
                    description_html=None,
                    workplace_type=None,
                    raw_payload=raw_payload,
                )
            )

        return jobs
