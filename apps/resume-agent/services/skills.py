"""Skill normalization and overlap scoring helpers.

Used by Stage 1 (parse) and Stage 3 (match scoring) so skill names are
compared by meaning, not fragile substring checks.
"""

from __future__ import annotations

import re

from services.score_contract import (
    ScoreDimension,
    ScoreEvidenceTier,
    ScoreResult,
    build_score_result,
    rating_from_similarity,
    score_dimension,
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


def build_match_score_result(
    *,
    semantic_score: float,
    skill_score: float,
    semantic_evaluated: bool = True,
    skills_evaluated: bool = True,
    description_present: bool = False,
    reason: str = "",
) -> ScoreResult:
    """Rate semantic and skill fit independently, then let the contract decide.

    No weighted sum: a strong embedding cannot lift a failed skill dimension.
    """
    tier: ScoreEvidenceTier = "stated" if description_present else "inferred"
    dimensions: list[ScoreDimension] = [
        score_dimension(
            "semantic",
            rating=(
                rating_from_similarity(semantic_score)
                if semantic_evaluated
                else None
            ),
            evidence_tier=tier,
            reason="Embedding similarity between candidate and job text.",
        ),
        score_dimension(
            "skills",
            rating=(
                rating_from_similarity(skill_score) if skills_evaluated else None
            ),
            evidence_tier=tier,
            reason="Skill overlap between profile and job requirements.",
        ),
    ]
    return build_score_result(dimensions=dimensions, reason=reason)


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
    """Rate each job dimension 1-5 and let the contract decide."""
    parts = {
        "text": round(max(0.0, min(1.0, text_score)), 4),
        "title": round(max(0.0, min(1.0, title_score)), 4),
        "skill": round(max(0.0, min(1.0, skill_score)), 4),
        "recency": round(max(0.0, min(1.0, recency_score)), 4),
    }
    dimensions = [
        score_dimension(
            "text",
            rating=(
                rating_from_similarity(parts["text"])
                if description_present
                else None
            ),
            evidence_tier="stated" if description_present else "structural",
            reason="Full-text similarity between profile and job.",
        ),
        score_dimension(
            "title",
            rating=rating_from_similarity(parts["title"]) if title_present else None,
            evidence_tier="structural" if title_present else "inferred",
            reason="Title similarity between profile role and job title.",
        ),
        score_dimension(
            "skills",
            rating=(
                rating_from_similarity(parts["skill"])
                if skills_evaluated
                else None
            ),
            evidence_tier="stated" if description_present else "inferred",
            reason="Overlap between profile skills and job requirements.",
        ),
        score_dimension(
            "recency",
            rating=(
                rating_from_similarity(parts["recency"])
                if recency_present
                else None
            ),
            evidence_tier="structural" if recency_present else "inferred",
            reason="Posting freshness.",
        ),
    ]
    return build_score_result(dimensions=dimensions, reason=reason), parts
