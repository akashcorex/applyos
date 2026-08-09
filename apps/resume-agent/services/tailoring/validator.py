"""Validation for resume variants before finalize."""

from __future__ import annotations

from models import VariantContent


class VariantValidationError(Exception):
    def __init__(self, errors: list[str]) -> None:
        self.errors = errors
        super().__init__("; ".join(errors))


def validate_variant_content(content: VariantContent) -> None:
    errors: list[str] = []

    if not content.full_name.strip():
        errors.append("Full name is required")
    if not content.email.strip() or "@" not in content.email:
        errors.append("Valid email is required")
    if content.experience_years < 0:
        errors.append("Experience years cannot be negative")
    if not content.skills:
        errors.append("At least one skill is required")

    for i, role in enumerate(content.work_history):
        if not role.company.strip():
            errors.append(f"Work history #{i + 1}: company is required")
        if not role.title.strip():
            errors.append(f"Work history #{i + 1}: title is required")
        for j, bullet in enumerate(role.highlights):
            if len(bullet) > 500:
                errors.append(
                    f"Work history #{i + 1} bullet #{j + 1} exceeds 500 characters"
                )

    if errors:
        raise VariantValidationError(errors)
