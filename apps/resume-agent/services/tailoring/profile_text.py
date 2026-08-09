"""Serialize structured profile content for LLM context."""

from __future__ import annotations

from models import VariantContent


def variant_content_to_prompt_text(content: VariantContent) -> str:
    lines = [
        f"Name: {content.full_name}",
        f"Email: {content.email}",
    ]
    if content.location:
        lines.append(f"Location: {content.location}")
    if content.preferred_role:
        lines.append(f"Target role: {content.preferred_role}")
    if content.summary:
        lines.append(f"Summary: {content.summary}")
    if content.skills:
        lines.append(f"Skills: {', '.join(content.skills)}")
    for role in content.work_history:
        lines.append(f"Role: {role.title} at {role.company}")
        for bullet in role.highlights:
            lines.append(f"  - {bullet}")
    for edu in content.education:
        lines.append(f"Education: {edu.degree}, {edu.school}")
    return "\n".join(lines)
