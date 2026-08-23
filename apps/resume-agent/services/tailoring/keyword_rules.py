"""Deterministic JD keyword alignment suggestions (no LLM)."""

from __future__ import annotations

import re

from models import CreateVariantRequest, VariantContent
from services.skills import (
    match_skills_in_text,
    normalize_skill,
    normalize_skills,
    skill_key,
)
from services.tailoring.suggestions import enrich_suggestion

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z0-9+#./-]{1,}")


def _jd_text(request: CreateVariantRequest) -> str:
    parts = [request.job_title or "", request.job_description or ""]
    if request.matched_skills:
        parts.append(", ".join(request.matched_skills))
    if request.missing_skills:
        parts.append(", ".join(request.missing_skills))
    return " ".join(parts)


def extract_jd_keywords(request: CreateVariantRequest) -> list[str]:
    """Return canonical skill-like keywords found in the job context."""
    haystack = _jd_text(request).lower()
    found: list[str] = []
    seen: set[str] = set()

    for raw in request.matched_skills + request.missing_skills:
        skill = normalize_skill(raw)
        if skill and skill_key(skill) not in seen:
            seen.add(skill_key(skill))
            found.append(skill)

    for token in _TOKEN_RE.findall(haystack):
        skill = normalize_skill(token)
        key = skill_key(skill)
        if key and key not in seen and len(skill) >= 2:
            seen.add(key)
            found.append(skill)
    return found[:30]


def _resume_corpus(content: VariantContent) -> str:
    parts: list[str] = []
    if content.summary:
        parts.append(content.summary)
    parts.extend(content.skills)
    for role in content.work_history:
        parts.append(f"{role.title} {role.company}")
        parts.extend(role.highlights or [])
    return " ".join(parts).lower()


def build_keyword_rule_suggestions(
    content: VariantContent,
    request: CreateVariantRequest,
) -> list[dict]:
    """Emit 0–3 low-risk keyword suggestions from rules only."""
    jd_keywords = extract_jd_keywords(request)
    if not jd_keywords:
        return []

    corpus = _resume_corpus(content)
    evidenced = [kw for kw in jd_keywords if kw.lower() in corpus or match_skills_in_text([kw], corpus)]
    suggestions: list[dict] = []
    has_job = bool((request.job_description or "").strip())

    # 1. Reorder skills — matched JD terms first, same skill set.
    if content.skills and evidenced:
        current = ", ".join(content.skills)
        priority_keys = {skill_key(k) for k in evidenced}
        front = [s for s in content.skills if skill_key(s) in priority_keys]
        rest = [s for s in content.skills if skill_key(s) not in priority_keys]
        if front and rest and content.skills != front + rest:
            suggestions.append(
                {
                    "section": "skills",
                    "current": current,
                    "suggested": ", ".join(front + rest),
                    "reason": (
                        f"Prioritize skills the job description emphasizes "
                        f"({', '.join(front[:4])}) without adding new skills."
                    ),
                    "confidence": 0.92,
                    "risk": "low",
                    "operation": "reorder_skills",
                }
            )

    # 2. Summary — move an evidenced JD term earlier when already present.
    if content.summary and evidenced and len(suggestions) < 3:
        summary = content.summary.strip()
        for kw in evidenced:
            if kw.lower() not in summary.lower():
                continue
            pattern = re.compile(re.escape(kw), re.IGNORECASE)
            if not pattern.search(summary):
                continue
            # Put keyword near the start if it appears later.
            match = pattern.search(summary)
            if match and match.start() > 40:
                rest = pattern.sub("", summary, count=1).strip()
                rest = re.sub(r"\s{2,}", " ", rest)
                suggested = f"{kw} — {rest}" if rest else summary
                if suggested != summary:
                    suggestions.append(
                        {
                            "section": "summary",
                            "current": summary,
                            "suggested": suggested[:600],
                            "reason": (
                                f"Surface '{kw}' earlier — it already appears in your "
                                "summary and matches the job description."
                            ),
                            "confidence": 0.88,
                            "risk": "low",
                            "operation": "summarize_existing",
                        }
                    )
                    break

    # 3. One bullet — lead with an evidenced JD keyword already in the bullet.
    if content.work_history and len(suggestions) < 3:
        for role in content.work_history:
            for bullet in role.highlights or []:
                bullet_lower = bullet.lower()
                hit = next(
                    (kw for kw in evidenced if kw.lower() in bullet_lower),
                    None,
                )
                if not hit:
                    continue
                if bullet_lower.startswith(hit.lower()):
                    continue
                suggested = f"{hit}: {bullet}"
                if suggested != bullet and len(suggested) <= int(len(bullet) * 1.2) + 20:
                    suggestions.append(
                        {
                            "section": "experience",
                            "current": bullet,
                            "suggested": suggested[:500],
                            "reason": (
                                f"Lead with '{hit}' — already evidenced in this bullet "
                                f"and listed in the job description."
                            ),
                            "confidence": 0.82,
                            "risk": "low",
                            "operation": "rewrite_existing",
                        }
                    )
                    break
            if len(suggestions) >= 3:
                break

    return [
        enrich_suggestion(item, index, has_job_context=has_job)
        for index, item in enumerate(suggestions)
    ]
