"""Abstract base class for all ATS handlers.

Every ATS module (workday.py, greenhouse.py, etc.) must subclass
``ATSHandler`` and implement the three abstract methods.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from playwright.async_api import Page

from app.models.job_payload import CVData


@dataclass
class FormField:
    """A single form field discovered on the application page."""

    selector: str
    label: str
    field_type: str  # "text" | "select" | "file" | "textarea" | "checkbox" | "radio"
    required: bool = False
    options: list[str] | None = None  # for select/radio fields


@dataclass
class FillResult:
    """Outcome of a fill-and-submit attempt."""

    success: bool
    ats_type: str
    fields_filled: int = 0
    error: str | None = None


class ATSHandler(ABC):
    """Interface that each ATS-specific module must implement."""

    ats_name: str = "unknown"

    @abstractmethod
    async def extract_fields(self, page: Page) -> list[FormField]:
        """Discover all fillable form fields on the current page.

        Returns a list of ``FormField`` instances describing each
        input, select, and file-upload element.
        """
        ...

    @abstractmethod
    async def fill_and_submit(
        self,
        page: Page,
        cv_data: CVData,
        field_mapping: dict[str, str],
    ) -> FillResult:
        """Fill every mapped field and submit the application.

        Args:
            page: Playwright page positioned on the application form.
            cv_data: Structured CV data to populate fields with.
            field_mapping: Mapping of ``FormField.selector`` → CV key
                produced by the LLM field mapper.

        Returns:
            A ``FillResult`` indicating success or failure.
        """
        ...

    @abstractmethod
    async def detect(self, page: Page) -> bool:
        """Return ``True`` if this handler can process the current page."""
        ...
