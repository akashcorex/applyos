"""Skill normalization and overlap scoring helpers.

Used by Stage 1 (parse) and Stage 3 (match scoring) so skill names are
compared by meaning, not fragile substring checks.
"""

from __future__ import annotations

import re

# Canonical name → accepted aliases (lowercase).
_SKILL_ALIASES: dict[str, set[str]] = {
    "JavaScript": {"js", "javascript", "ecmascript", "es6", "es2015"},
    "TypeScript": {"ts", "typescript"},
    "Python": {"python", "py"},
    "React": {"react", "reactjs", "react.js"},
    "Next.js": {"next", "nextjs", "next.js"},
    "Node.js": {"node", "nodejs", "node.js"},
    "Vue.js": {"vue", "vuejs", "vue.js"},
    "Angular": {"angular", "angularjs"},
    "PostgreSQL": {"postgres", "postgresql", "psql"},
    "MongoDB": {"mongo", "mongodb"},
    "Redis": {"redis"},
    "AWS": {"aws", "amazon web services"},
    "GCP": {"gcp", "google cloud", "google cloud platform"},
    "Azure": {"azure", "microsoft azure"},
    "Docker": {"docker"},
    "Kubernetes": {"k8s", "kubernetes"},
    "GraphQL": {"graphql", "gql"},
    "REST APIs": {"rest", "rest api", "rest apis", "restful", "restful apis"},
    "HTML": {"html", "html5"},
    "CSS": {"css", "css3"},
    "Tailwind CSS": {"tailwind", "tailwindcss", "tailwind css"},
    "Django": {"django"},
    "Flask": {"flask"},
    "FastAPI": {"fastapi", "fast api"},
    "Express": {"express", "expressjs", "express.js"},
    "Go": {"go", "golang"},
    "Rust": {"rust"},
    "Java": {"java"},
    "C++": {"c++", "cpp", "cplusplus"},
    "C#": {"c#", "csharp", "c sharp"},
    "SQL": {"sql"},
    "Machine Learning": {"ml", "machine learning"},
    "Deep Learning": {"deep learning", "dl"},
    "PyTorch": {"pytorch", "torch"},
    "TensorFlow": {"tensorflow", "tf"},
    "CI/CD": {"ci/cd", "cicd", "continuous integration"},
    "Git": {"git", "github", "gitlab"},
    "Linux": {"linux", "unix"},
    "Kafka": {"kafka", "apache kafka"},
    "Elasticsearch": {"elasticsearch", "elastic search", "es"},
    "Spark": {"spark", "apache spark"},
    "Airflow": {"airflow", "apache airflow"},
    "Terraform": {"terraform", "tf"},
    "Prisma": {"prisma"},
    "Redux": {"redux"},
    "Svelte": {"svelte", "sveltekit"},
    "Flutter": {"flutter"},
    "Swift": {"swift"},
    "Kotlin": {"kotlin"},
    "Ruby on Rails": {"rails", "ruby on rails", "ror"},
    "PHP": {"php"},
    "Laravel": {"laravel"},
    "Spring Boot": {"spring", "spring boot", "springboot"},
    "Pandas": {"pandas"},
    "NumPy": {"numpy", "np"},
    "scikit-learn": {"scikit-learn", "sklearn", "scikit learn"},
    "LangChain": {"langchain"},
    "OpenAI": {"openai", "gpt"},
}

# Alias → canonical (built once).
_ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canonical, _aliases in _SKILL_ALIASES.items():
    _ALIAS_TO_CANONICAL[_canonical.lower()] = _canonical
    for _alias in _aliases:
        _ALIAS_TO_CANONICAL[_alias.lower()] = _canonical


def normalize_skill(skill: str) -> str:
    """Normalize a single skill name to its canonical form when known."""
    cleaned = re.sub(r"\s+", " ", (skill or "").strip())
    if not cleaned:
        return ""
    canonical = _ALIAS_TO_CANONICAL.get(cleaned.lower())
    if canonical:
        return canonical
    # Title-case multi-word unknowns; preserve common casing for acronyms.
    if cleaned.isupper() and len(cleaned) <= 5:
        return cleaned
    return cleaned[0].upper() + cleaned[1:] if len(cleaned) > 1 else cleaned.upper()


def normalize_skills(skills: list[str] | None) -> list[str]:
    """Normalize, dedupe (case-insensitive), and drop empties."""
    seen: set[str] = set()
    result: list[str] = []
    for raw in skills or []:
        skill = normalize_skill(raw)
        if not skill:
            continue
        key = skill.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(skill)
    return result


def skill_key(skill: str) -> str:
    """Comparable key for a skill (canonical when possible)."""
    return normalize_skill(skill).lower()


def skills_match(a: str, b: str) -> bool:
    """True when two skill strings refer to the same capability."""
    return skill_key(a) == skill_key(b)


def find_matching_skills(
    resume_skills: list[str],
    reference_skills: list[str],
) -> list[str]:
    """Return resume skills that semantically overlap with reference skills."""
    ref_keys = {skill_key(s) for s in reference_skills if s}
    matched: list[str] = []
    seen: set[str] = set()
    for skill in resume_skills:
        key = skill_key(skill)
        if key and key in ref_keys and key not in seen:
            seen.add(key)
            matched.append(normalize_skill(skill))
    return matched


def _term_in_text(term: str, text: str) -> bool:
    escaped = re.escape(term.lower())
    if " " in term or "+" in term or "#" in term:
        pattern = rf"(?<![a-z0-9]){escaped}(?![a-z0-9])"
    else:
        pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text, re.IGNORECASE))


def match_skills_in_text(candidate_skills: list[str], text: str) -> list[str]:
    """Return candidate skills found in text using word boundaries."""
    if not candidate_skills or not text:
        return []
    text_lower = text.lower()
    matched: list[str] = []
    seen: set[str] = set()
    for skill in candidate_skills:
        canonical = normalize_skill(skill)
        key = skill_key(canonical)
        if key in seen:
            continue
        aliases = {key, skill.lower()}
        canon = _ALIAS_TO_CANONICAL.get(key)
        if canon:
            aliases |= {a.lower() for a in _SKILL_ALIASES.get(canon, set())}
            aliases.add(canon.lower())
        if any(_term_in_text(a, text_lower) for a in aliases if a):
            seen.add(key)
            matched.append(canonical)
    return matched


def skill_overlap_score(
    matched_skills: list[str],
    missing_skills: list[str],
) -> float:
    """Overlap in [0, 1] from matched vs missing required skills."""
    matched = len(matched_skills)
    missing = len(missing_skills)
    total = matched + missing
    if total == 0:
        return 0.0
    return matched / total


def combine_match_score(semantic_score: float, skill_score: float) -> float:
    """70% embedding similarity + 30% skill overlap → score in [0, 100]."""
    semantic = max(0.0, min(1.0, semantic_score))
    skills = max(0.0, min(1.0, skill_score))
    return round((0.7 * semantic + 0.3 * skills) * 100, 1)
