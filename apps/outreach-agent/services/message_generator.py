"""LangChain-powered personalised outreach message generation.

Given a contact (recruiter, hiring manager, or potential connection) and
candidate context, generates a personalised outreach message using Claude
via LangChain's ``ChatAnthropic.with_structured_output()``.
"""

from __future__ import annotations

import asyncio
import logging

from langchain_core.prompts import ChatPromptTemplate

from config import settings
from models import ContactInfo, GenerateOutreachRequest, OutreachMessage
from services.llm import get_llm

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = """\
You are an expert at writing personalised outreach messages for professional \
networking and job seeking.

Your goal is to write a concise, genuine, and effective message that:
1. References something specific about the contact or their company
2. Establishes relevance — why the candidate is reaching out
3. Has a clear, low-friction call to action
4. Feels personal, not templated

Guidelines:
- Subject lines should be short, specific, and curiosity-inducing (under 60 chars)
- Body should be 50-150 words — short enough to read on mobile
- Match the requested tone (professional, casual, or friendly)
- Do not use generic phrases like "I hope this finds you well"
- Reference the candidate's relevant skills or experience naturally
- If a job title is provided, align the message with that role
- Include personalization_notes explaining what makes this message specific
"""


class OutreachMessageGenerator:
    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_chain(self):
        llm = self._llm or get_llm()
        structured_llm = llm.with_structured_output(OutreachMessage)
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", _SYSTEM_PROMPT),
                (
                    "human",
                    "## Contact\n"
                    "Name: {contact_name}\n"
                    "Title: {contact_title}\n"
                    "Company: {contact_company}\n\n"
                    "## Candidate\n"
                    "Name: {candidate_name}\n"
                    "Role: {candidate_role}\n"
                    "Skills: {candidate_skills}\n\n"
                    "## Context\n"
                    "Target company: {company_name}\n"
                    "Job title: {job_title}\n"
                    "Tone: {tone}",
                ),
            ]
        )
        return prompt | structured_llm

    async def generate(self, request: GenerateOutreachRequest) -> OutreachMessage:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")

        chain = self._get_chain()
        contact = request.contact

        result = await chain.ainvoke(
            {
                "contact_name": contact.name,
                "contact_title": contact.title or "N/A",
                "contact_company": contact.company or "N/A",
                "candidate_name": request.candidate_name,
                "candidate_role": request.candidate_role,
                "candidate_skills": ", ".join(request.candidate_skills) or "N/A",
                "company_name": request.company_name or "N/A",
                "job_title": request.job_title or "N/A",
                "tone": request.tone,
            }
        )
        logger.info(
            "Generated outreach message for %s (subject=%r)",
            contact.name,
            result.subject,
        )
        return result

    async def generate_batch(
        self,
        contacts: list[ContactInfo],
        request: GenerateOutreachRequest,
    ) -> list[OutreachMessage]:
        tasks = []
        for contact in contacts:
            single_request = request.model_copy(update={"contact": contact})
            tasks.append(self.generate(single_request))
        results = await asyncio.gather(*tasks, return_exceptions=True)

        messages: list[OutreachMessage] = []
        for i, result in enumerate(results):
            if isinstance(result, OutreachMessage):
                messages.append(result)
            else:
                logger.error("Batch outreach failed for contact %d: %s", i, result)
        return messages
