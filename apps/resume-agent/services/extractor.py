"""Claude-powered structured extraction from raw resume text.

Uses LangChain's ``ChatAnthropic.with_structured_output()`` which leverages
Anthropic's tool-use API for reliable structured responses — no manual
JSON parsing or fence-stripping required.
"""

from __future__ import annotations

import logging
from pathlib import Path

from langchain_core.prompts import ChatPromptTemplate

from models import ResumeRecord, RawLLMExtraction
from services.llm import get_llm

logger = logging.getLogger(__name__)

_PROMPT_PATH = Path(__file__).parent / "prompts" / "resume_extract.txt"


def _load_prompt() -> str:
    return _PROMPT_PATH.read_text(encoding="utf-8")


class LLMExtractor:
    """Calls Claude (via LangChain) to turn raw resume text into a ResumeRecord."""

    def __init__(self, llm=None) -> None:
        self._llm = llm

    def _get_structured_llm(self):
        llm = self._llm or get_llm()
        return llm.with_structured_output(RawLLMExtraction)

    async def extract(
        self,
        raw_text: str,
        user_id: str,
        file_name: str | None = None,
        file_type: str | None = None,
    ) -> ResumeRecord:
        system_prompt = _load_prompt()
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "{system_prompt}"),
                (
                    "human",
                    "Extract the structured resume data from the text below.\n\n"
                    "---- RESUME TEXT START ----\n{resume_text}\n"
                    "---- RESUME TEXT END ----",
                ),
            ]
        )

        structured_llm = self._get_structured_llm()
        chain = prompt | structured_llm

        partial = await chain.ainvoke(
            {"system_prompt": system_prompt, "resume_text": raw_text}
        )
        record = self._to_record(
            partial,
            user_id=user_id,
            raw_text=raw_text,
            file_name=file_name,
            file_type=file_type,
        )
        logger.info(
            "Extracted resume for user=%s name=%s skills=%d",
            user_id,
            record.full_name,
            len(record.skills),
        )
        return record

    @staticmethod
    def _to_record(
        partial: RawLLMExtraction,
        user_id: str,
        raw_text: str,
        file_name: str | None,
        file_type: str | None,
    ) -> ResumeRecord:
        return ResumeRecord(
            user_id=user_id,
            full_name=partial.full_name or "",
            email=partial.email or "",
            phone=partial.phone,
            location=partial.location,
            summary=partial.summary,
            experience_years=partial.experience_years or 0,
            skills=partial.skills or [],
            education=[
                {
                    "degree": e.get("degree", ""),
                    "school": e.get("school", ""),
                    "year": e.get("year"),
                }
                for e in (partial.education or [])
            ],
            work_history=[
                {
                    "company": w.get("company", ""),
                    "title": w.get("title", ""),
                    "start_date": w.get("start_date"),
                    "end_date": w.get("end_date"),
                    "highlights": w.get("highlights", []) or [],
                }
                for w in (partial.work_history or [])
            ],
            preferred_role=partial.preferred_role,
            preferred_locations=partial.preferred_locations or [],
            raw_text=raw_text,
            file_name=file_name,
            file_type=file_type,
        )
