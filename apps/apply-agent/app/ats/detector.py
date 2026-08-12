"""Detect which ATS a job URL belongs to and return the right handler.

The detector uses URL pattern matching first (fast, no network),
then falls back to page-content sniffing if the URL is ambiguous.
"""

from __future__ import annotations

import logging
import re
from urllib.parse import urlparse

from playwright.async_api import Page

from app.ats.ashby import AshbyHandler
from app.ats.base import ATSHandler
from app.ats.easy_apply import EasyApplyHandler
from app.ats.generic import GenericHandler
from app.ats.greenhouse import GreenhouseHandler
from app.ats.lever import LeverHandler
from app.ats.wellfound import WellfoundHandler
from app.ats.workable import WorkableHandler
from app.ats.workday import WorkdayHandler

logger = logging.getLogger(__name__)

# Ordered list of (url_pattern, handler_class)
_URL_PATTERNS: list[tuple[re.Pattern, type[ATSHandler]]] = [
    (re.compile(r"greenhouse\.io|boards\.greenhouse", re.I), GreenhouseHandler),
    (re.compile(r"myworkdayjobs\.com|workday\.com", re.I), WorkdayHandler),
    (re.compile(r"lever\.co|jobs\.lever", re.I), LeverHandler),
    (re.compile(r"ashbyhq\.com|jobs\.ashby", re.I), AshbyHandler),
    (re.compile(r"workable\.com|apply\.workable", re.I), WorkableHandler),
    (re.compile(r"wellfound\.com|angel\.co/jobs|angelist\.com/jobs", re.I), WellfoundHandler),
    (re.compile(r"linkedin\.com/jobs", re.I), EasyApplyHandler),
]


def detect_from_url(url: str) -> ATSHandler | None:
    """Attempt to identify the ATS purely from the URL string.

    Returns an instantiated handler, or ``None`` if no pattern matches.
    """
    for pattern, handler_cls in _URL_PATTERNS:
        if pattern.search(url):
            handler = handler_cls()
            logger.info("URL match → %s for %s", handler.ats_name, url)
            return handler
    return None


async def detect_from_page(page: Page) -> ATSHandler:
    """Inspect page content to pick a handler when URL matching fails.

    Falls through every registered handler's ``detect()`` method;
    returns ``GenericHandler`` if nothing else claims the page.
    """
    handlers: list[ATSHandler] = [
        GreenhouseHandler(),
        WorkdayHandler(),
        LeverHandler(),
        AshbyHandler(),
        WorkableHandler(),
        WellfoundHandler(),
        EasyApplyHandler(),
    ]
    for handler in handlers:
        try:
            if await handler.detect(page):
                logger.info("Page sniff → %s", handler.ats_name)
                return handler
        except Exception:
            continue

    logger.info("No ATS detected — falling back to GenericHandler")
    return GenericHandler()


async def get_handler(url: str, page: Page) -> ATSHandler:
    """Main entry point: URL match first, then page sniff, then generic."""
    handler = detect_from_url(url)
    if handler is not None:
        return handler
    return await detect_from_page(page)
