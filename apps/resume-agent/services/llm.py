"""Shared LangChain LLM client (ChatAnthropic) for resume-agent.

Centralises model configuration so every LangChain chain and structured-output
call uses the same Claude instance with consistent retries and timeouts.
"""

from __future__ import annotations

import logging

from langchain_anthropic import ChatAnthropic

from config import settings

logger = logging.getLogger(__name__)

_llm: ChatAnthropic | None = None


def get_llm() -> ChatAnthropic:
    global _llm
    if _llm is None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        _llm = ChatAnthropic(
            model=settings.llm_model,
            api_key=settings.anthropic_api_key,
            max_tokens=settings.llm_max_tokens,
            timeout=settings.llm_timeout_seconds,
            temperature=0,
        )
        logger.info("ChatAnthropic initialised (model=%s)", settings.llm_model)
    return _llm
