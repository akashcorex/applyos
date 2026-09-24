"""Alias parity between job-agent and resume-agent skill vocabularies."""

from __future__ import annotations

import ast
from pathlib import Path

from services.skill_utils import _SKILL_ALIASES as JOB_AGENT_ALIASES

ROOT = Path(__file__).resolve().parent.parent


def _load_resume_aliases() -> dict[str, set[str]]:
    source = (ROOT / "apps" / "resume-agent" / "services" / "skills.py").read_text(
        encoding="utf-8"
    )
    tree = ast.parse(source)
    for node in tree.body:
        target = node.target if isinstance(node, ast.AnnAssign) else None
        if target is None and isinstance(node, ast.Assign) and node.targets:
            target = node.targets[0]
        if isinstance(target, ast.Name) and target.id == "_SKILL_ALIASES":
            return ast.literal_eval(node.value)
    raise AssertionError("resume-agent _SKILL_ALIASES not found")


def test_skill_aliases_match_resume_agent() -> None:
    resume_aliases = _load_resume_aliases()
    assert set(resume_aliases) == set(JOB_AGENT_ALIASES)
    for canonical, aliases in resume_aliases.items():
        assert set(aliases) == set(JOB_AGENT_ALIASES[canonical]), canonical


def test_expanded_vocabularies_cover_data_roles() -> None:
    from services.skill_utils import match_skills_in_text

    text = "Spark, Airflow, dbt and Snowflake pipelines with Kubernetes"
    matched = match_skills_in_text(
        ["Spark", "Airflow", "dbt", "Snowflake", "Kubernetes"], text
    )
    assert set(matched) == {"Spark", "Airflow", "dbt", "Snowflake", "Kubernetes"}
