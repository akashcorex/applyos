from __future__ import annotations

import pytest
from langchain_core.runnables import RunnableLambda

from models import ContactInfo, GenerateOutreachRequest, OutreachMessage
import services.llm as llm_module
from services.message_generator import OutreachMessageGenerator


class _FakeChatAnthropic:
    def __init__(self, return_value: OutreachMessage) -> None:
        self._return_value = return_value

    def with_structured_output(self, schema, **kwargs):
        rv = self._return_value

        async def _fake_ainvoke(input_dict, config=None, **kw):
            return rv

        return RunnableLambda(_fake_ainvoke)


def _sample_request() -> GenerateOutreachRequest:
    return GenerateOutreachRequest(
        contact=ContactInfo(
            name="John Smith",
            title="Engineering Manager",
            company="Stripe",
        ),
        candidate_name="Jane Doe",
        candidate_role="Senior Software Engineer",
        candidate_skills=["Python", "React", "TypeScript"],
        company_name="Stripe",
        job_title="Senior Full Stack Engineer",
        tone="professional",
    )


@pytest.mark.asyncio
async def test_generate_outreach_message(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(llm_module, "_llm", None)

    expected = OutreachMessage(
        subject="Connecting re: Senior Full Stack at Stripe",
        body="Hi John, I saw Stripe is hiring Senior Full Stack Engineers...",
        tone="professional",
        personalization_notes="Referenced Stripe's engineering blog post on checkout",
    )
    fake_llm = _FakeChatAnthropic(expected)
    generator = OutreachMessageGenerator(llm=fake_llm)

    result = await generator.generate(_sample_request())

    assert result.subject == expected.subject
    assert result.body == expected.body
    assert result.tone == "professional"


@pytest.mark.asyncio
async def test_generate_outreach_raises_without_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_module.settings, "anthropic_api_key", "")
    monkeypatch.setattr(llm_module, "_llm", None)

    generator = OutreachMessageGenerator()
    with pytest.raises(RuntimeError):
        await generator.generate(_sample_request())


@pytest.mark.asyncio
async def test_generate_batch_outreach(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(llm_module.settings, "anthropic_api_key", "test-key")
    monkeypatch.setattr(llm_module, "_llm", None)

    msg = OutreachMessage(
        subject="Hello",
        body="Hi there",
        tone="professional",
    )
    fake_llm = _FakeChatAnthropic(msg)
    generator = OutreachMessageGenerator(llm=fake_llm)

    contacts = [
        ContactInfo(name="John", company="Stripe"),
        ContactInfo(name="Jane", company="Notion"),
    ]
    request = _sample_request()

    messages = await generator.generate_batch(contacts, request)

    assert len(messages) == 2
    assert all(isinstance(m, OutreachMessage) for m in messages)
