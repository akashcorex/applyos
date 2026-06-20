import json

import httpx
import pytest

from models import CompanyTarget, DiscoveredJobRecord
from services.job_client import JobAgentClient


@pytest.mark.asyncio
async def test_job_client_maps_ingest_response(monkeypatch: pytest.MonkeyPatch) -> None:
    target = CompanyTarget(
        company_name="Stripe",
        ats_type="greenhouse",
        ats_slug="stripe",
    )
    response_payload = {
        "jobs": [
            {
                "external_id": "123",
                "source": "greenhouse",
                "title": "Software Engineer",
                "department": "Engineering",
                "location": "Remote",
                "location_type": "remote",
                "seniority": "senior",
                "application_url": "https://boards.greenhouse.io/stripe/jobs/123",
                "description_raw": "Build APIs",
                "dedup_key": "stripe::software engineer::remote",
            }
        ]
    }

    class FakeResponse:
        def raise_for_status(self) -> None:
            return None

        def json(self) -> dict:
            return response_payload

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def post(self, url: str, json: dict) -> FakeResponse:
            assert url.endswith("/ingest/greenhouse")
            assert json["ats_slug"] == "stripe"
            assert json["company_id"] == "Stripe"
            return FakeResponse()

    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: FakeClient())

    jobs = await JobAgentClient(base_url="http://job-agent.test").ingest_company(target)

    assert len(jobs) == 1
    assert jobs[0].application_url.endswith("/123")
    assert jobs[0].company_name == "Stripe"
