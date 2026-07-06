from __future__ import annotations

import pytest
from langchain_core.runnables import RunnableLambda

from config import settings
from models import RawLLMExtraction, ResumeRecord
from services.extractor import LLMExtractor


class _FakeChatAnthropic:
    """Fake ChatAnthropic LLM for testing."""

    def __init__(self, return_value: RawLLMExtraction) -> None:
        self._return_value = return_value

    def with_structured_output(self, schema, **kwargs):
        rv = self._return_value

        async def _fake_ainvoke(input_dict, config=None, **kw):
            return rv

        return RunnableLambda(_fake_ainvoke)


def _sample_extraction() -> RawLLMExtraction:
    return RawLLMExtraction(
        full_name="Jane Doe",
        email="jane@example.com",
        phone="+1-555-0123",
        location="San Francisco, CA",
        summary="Full-stack engineer.",
        experience_years=5,
        skills=["Python", "React", "TypeScript"],
        education=[
            {"degree": "B.S. Computer Science", "school": "UC Berkeley", "year": 2019}
        ],
        work_history=[
            {
                "company": "Stripe",
                "title": "Senior Software Engineer",
                "start_date": "2022-01",
                "end_date": None,
                "highlights": ["Led checkout team"],
            }
        ],
        preferred_role="Senior Full Stack Engineer",
        preferred_locations=["San Francisco", "Remote"],
    )


def test_to_record_maps_llm_payload_to_resume_record() -> None:
    partial = _sample_extraction()
    record = LLMExtractor._to_record(
        partial,
        user_id="user-1",
        raw_text="raw text",
        file_name="jane.pdf",
        file_type="pdf",
    )

    assert isinstance(record, ResumeRecord)
    assert record.user_id == "user-1"
    assert record.full_name == "Jane Doe"
    assert record.experience_years == 5
    assert record.skills == ["Python", "React", "TypeScript"]
    assert record.education[0].school == "UC Berkeley"
    assert record.education[0].year == 2019
    assert record.work_history[0].company == "Stripe"
    assert record.work_history[0].highlights == ["Led checkout team"]
    assert record.preferred_role == "Senior Full Stack Engineer"
    assert record.preferred_locations == ["San Francisco", "Remote"]
    assert record.raw_text == "raw text"
    assert record.file_type == "pdf"


def test_to_record_handles_empty_fields() -> None:
    partial = RawLLMExtraction(full_name="", email="")
    record = LLMExtractor._to_record(
        partial, user_id="u", raw_text="", file_name=None, file_type=None
    )
    assert record.full_name == ""
    assert record.email == ""
    assert record.skills == []
    assert record.education == []
    assert record.work_history == []
    assert record.experience_years == 0


@pytest.mark.asyncio
async def test_extract_full_flow_with_fake_llm() -> None:
    fake_llm = _FakeChatAnthropic(_sample_extraction())
    extractor = LLMExtractor(llm=fake_llm)

    record = await extractor.extract(
        raw_text="Jane Doe\njane@example.com\nPython, React",
        user_id="user-1",
        file_name="jane.pdf",
        file_type="pdf",
    )

    assert record.full_name == "Jane Doe"
    assert record.email == "jane@example.com"
    assert record.skills == ["Python", "React", "TypeScript"]
    assert record.preferred_role == "Senior Full Stack Engineer"


@pytest.mark.asyncio
async def test_extract_raises_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "")
    import services.llm as llm_module

    monkeypatch.setattr(llm_module, "_llm", None)

    extractor = LLMExtractor()
    with pytest.raises(RuntimeError):
        await extractor.extract(raw_text="x", user_id="u")
