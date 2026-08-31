"""Exceptions for human-in-the-loop application flow."""

from __future__ import annotations

PENDING_SUBMIT_APPROVAL = "__PENDING_SUBMIT_APPROVAL__"


class HumanInterventionRequired(Exception):
    """Raised when the agent must pause and hand control to the user."""

    def __init__(
        self,
        intervention_type: str,
        message: str,
    ) -> None:
        super().__init__(message)
        self.intervention_type = intervention_type
        self.message = message
