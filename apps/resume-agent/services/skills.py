"""Skill normalization and overlap scoring helpers.

Used by Stage 1 (parse) and Stage 3 (match scoring) so skill names are
compared by meaning, not fragile substring checks.
"""

from __future__ import annotations

import re

from services.score_contract import (
    ScoreResult,
    build_score_result,
    clamp_score,
    score_component,
)

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
    "Jest": {"jest"},
    "Pytest": {"pytest"},
    "Cypress": {"cypress"},
    "Playwright": {"playwright"},
    "Selenium": {"selenium"},
    "Celery": {"celery"},
    "gRPC": {"grpc"},
    "OAuth": {"oauth"},
    "JWT": {"jwt"},
    "WebSockets": {"websocket", "websockets"},
    "Microservices": {"microservices"},
    "System Design": {"system design"},
    "Agile": {"agile", "scrum"},
    "NLP": {"nlp", "natural language processing"},
    "LLM": {"llm", "large language model", "genai"},
    "Anthropic": {"anthropic", "claude"},
    "Vector Databases": {"pinecone", "weaviate", "chroma", "vector database", "vector db"},
    "Tableau": {"tableau"},
    "Power BI": {"power bi"},
    "BigQuery": {"bigquery"},
    "Snowflake": {"snowflake"},
    "dbt": {"dbt"},
    "Redshift": {"redshift"},
    "DynamoDB": {"dynamodb"},
    "SQS": {"sqs"},
    "Lambda": {"lambda", "aws lambda"},
    "EC2": {"ec2"},
    "S3": {"s3"},
    "CloudFormation": {"cloudformation"},
    "Ansible": {"ansible"},
    "Prometheus": {"prometheus"},
    "Grafana": {"grafana"},
    "Datadog": {"datadog"},
    "Jenkins": {"jenkins"},
    "GitHub Actions": {"github actions"},
    "Gradle": {"gradle"},
    "Maven": {"maven"},
    "Bash": {"bash", "shell"},
    "Sequelize": {"sequelize"},
    "Mongoose": {"mongoose"},
    "NestJS": {"nestjs", "nest.js"},
    "React Native": {"react native"},
    "Expo": {"expo"},
    "Electron": {"electron"},
    "Firebase": {"firebase"},
    "Supabase": {"supabase"},
    "Figma": {"figma"},
    "Jira": {"jira"},
    "Scala": {"scala"},
    "Elixir": {"elixir"},
    "Dart": {"dart"},
    "tRPC": {"trpc"},
    "Vite": {"vite"},
    "Webpack": {"webpack"},
    "Storybook": {"storybook"},
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


def combine_job_score(
    text_score: float,
    title_score: float,
    skill_score: float,
    recency_score: float,
) -> tuple[float, dict[str, float]]:
    """45% full-text + 15% title + 30% skill + 10% recency → (score, parts)."""
    parts = {
        "text": round(max(0.0, min(1.0, text_score)), 4),
        "title": round(max(0.0, min(1.0, title_score)), 4),
        "skill": round(max(0.0, min(1.0, skill_score)), 4),
        "recency": round(max(0.0, min(1.0, recency_score)), 4),
    }
    final = round(
        (
            0.45 * parts["text"]
            + 0.15 * parts["title"]
            + 0.30 * parts["skill"]
            + 0.10 * parts["recency"]
        )
        * 100,
        1,
    )
    return final, parts


def build_match_score_result(
    *,
    semantic_score: float,
    skill_score: float,
    semantic_evaluated: bool = True,
    skills_evaluated: bool = True,
    description_present: bool = False,
    reason: str = "",
) -> ScoreResult:
    """70/30 semantic+skills score with named, inspectable components."""
    semantic = clamp_score(semantic_score * 100) / 100
    skills = clamp_score(skill_score * 100) / 100
    components = []
    not_evaluated: list[str] = []

    if semantic_evaluated:
        components.append(
            score_component(
                "semantic",
                weight=0.7,
                score=semantic * 100,
                evidence_tier="stated" if description_present else "inferred",
                reason="Embedding similarity between candidate and job text.",
            )
        )
    else:
        not_evaluated.append("semantic")

    if skills_evaluated:
        components.append(
            score_component(
                "skills",
                weight=0.3,
                score=skills * 100,
                evidence_tier="stated" if description_present else "inferred",
                reason="Skill overlap between profile and job requirements.",
            )
        )
    else:
        not_evaluated.append("skills")

    return build_score_result(
        score=combine_match_score(semantic, skills),
        components=components,
        reason=reason,
        not_evaluated=not_evaluated,
    )


def build_job_score_result(
    *,
    text_score: float,
    title_score: float,
    skill_score: float,
    recency_score: float,
    title_present: bool = True,
    description_present: bool = True,
    skills_evaluated: bool = True,
    recency_present: bool = True,
    reason: str = "",
) -> tuple[ScoreResult, dict[str, float]]:
    """45/15/30/10 job score with named components and explicit gaps."""
    final, parts = combine_job_score(
        text_score, title_score, skill_score, recency_score
    )
    components = [
        score_component(
            "text",
            weight=0.45,
            score=parts["text"] * 100,
            evidence_tier="stated" if description_present else "structural",
            reason="Full-text similarity between profile and job.",
        ),
        score_component(
            "title",
            weight=0.15,
            score=parts["title"] * 100,
            evidence_tier="structural" if title_present else "inferred",
            reason="Title similarity between profile role and job title.",
        ),
        score_component(
            "skills",
            weight=0.30,
            score=parts["skill"] * 100,
            evidence_tier="stated" if description_present else "inferred",
            reason="Overlap between profile skills and job requirements.",
        ),
        score_component(
            "recency",
            weight=0.10,
            score=parts["recency"] * 100,
            evidence_tier="structural" if recency_present else "inferred",
            reason="Posting freshness.",
        ),
    ]

    not_evaluated: list[str] = []
    if not description_present:
        not_evaluated.append("text")
    if not title_present:
        not_evaluated.append("title")
    if not skills_evaluated:
        not_evaluated.append("skills")
    if not recency_present:
        not_evaluated.append("recency")

    return (
        build_score_result(
            score=final,
            components=components,
            reason=reason,
            not_evaluated=not_evaluated,
        ),
        parts,
    )
