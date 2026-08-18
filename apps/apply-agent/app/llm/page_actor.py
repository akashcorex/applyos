"""Choose the next browser action on an unknown apply page."""

from __future__ import annotations

import json
import logging
from typing import Literal

from pydantic import BaseModel, Field

from app.models.job_payload import CVData

logger = logging.getLogger(__name__)

MAX_AGENT_STEPS = 12


class PageElement(BaseModel):
    id: str
    tag: str
    type: str = ""
    text: str = ""
    name: str = ""
    href: str = ""


class PageAction(BaseModel):
    action: Literal[
        "click",
        "type",
        "upload",
        "select",
        "wait",
        "submit",
        "done",
        "give_up",
    ]
    element_id: str | None = None
    value: str | None = None
    cv_key: str | None = None
    reason: str = Field(default="")


SNAPSHOT_JS = """
() => {
  const selector = 'a, button, input, textarea, select, [role="button"], [role="textbox"], [role="combobox"], [role="link"]';
  const nodes = Array.from(document.querySelectorAll(selector));
  const visible = nodes.filter((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  }).slice(0, 60);
  return visible.map((el, i) => {
    el.setAttribute('data-agent-id', String(i));
    return {
      id: String(i),
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || '').trim().slice(0, 80),
      name: el.getAttribute('name') || '',
      href: el.getAttribute('href') || '',
    };
  });
}
"""


async def choose_next_action(
    *,
    url: str,
    visible_text: str,
    elements: list[PageElement],
    cv_data: CVData,
    history: list[str],
) -> PageAction:
    from app.config import settings
    from app.llm.llm_client import get_llm

    if not settings.anthropic_api_key:
        return PageAction(action="give_up", reason="ANTHROPIC_API_KEY is not set")

    structured = get_llm().with_structured_output(PageAction)
    prompt = (
        "You are filling a job application in a browser. Return ONE next action.\n"
        "Actions: click, type, upload (resume), select, wait, submit, done, give_up.\n"
        "Use element_id from the snapshot. For type/select, set value or cv_key "
        "(full_name, email, phone, location, summary, linkedin_url, github_url).\n"
        "Call upload when a file input is visible. Call submit only when the form looks complete.\n"
        "Call done after a confirmation/thank-you page. Call give_up on login walls or captchas.\n\n"
        f"URL: {url}\n"
        f"Visible text:\n{visible_text[:2500]}\n\n"
        f"Elements:\n{json.dumps([el.model_dump() for el in elements], indent=2)[:6000]}\n\n"
        f"CV:\n{json.dumps(cv_data.model_dump(), default=str)[:2500]}\n\n"
        f"History:\n{chr(10).join(history[-8:]) or '(none)'}"
    )
    try:
        action = await structured.ainvoke(prompt)
    except Exception as exc:
        logger.warning("Page actor LLM failed: %s", exc)
        return PageAction(action="give_up", reason=str(exc))

    if isinstance(action, PageAction):
        return action
    return PageAction(action="give_up", reason="invalid actor response")
