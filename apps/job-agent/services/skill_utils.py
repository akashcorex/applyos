"""Skill matching helpers for job-agent (word-boundary, alias-aware)."""

from __future__ import annotations

import re

# Canonical → aliases (lowercase). Kept in sync with resume-agent/services/skills.py.
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

_ALIAS_TO_CANONICAL: dict[str, str] = {}
for _canonical, _aliases in _SKILL_ALIASES.items():
    _ALIAS_TO_CANONICAL[_canonical.lower()] = _canonical
    for _alias in _aliases:
        _ALIAS_TO_CANONICAL[_alias.lower()] = _canonical

_ALL_CANONICAL: list[str] = sorted(_SKILL_ALIASES.keys(), key=len, reverse=True)


def _term_in_text(term: str, text: str) -> bool:
    """Match a skill term on word boundaries (not substring)."""
    escaped = re.escape(term.lower())
    if " " in term or "+" in term or "#" in term:
        pattern = rf"(?<![a-z0-9]){escaped}(?![a-z0-9])"
    else:
        pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text, re.IGNORECASE))


def match_skills_in_text(candidate_skills: list[str], text: str) -> list[str]:
    """Return candidate skills that appear in text (alias-aware, word boundaries)."""
    if not candidate_skills or not text:
        return []
    text_lower = text.lower()
    matched: list[str] = []
    seen: set[str] = set()

    for skill in candidate_skills:
        canonical = _ALIAS_TO_CANONICAL.get(skill.lower(), skill)
        key = canonical.lower()
        if key in seen:
            continue
        terms = {canonical.lower(), skill.lower()} | _SKILL_ALIASES.get(canonical, set())
        if any(_term_in_text(term, text_lower) for term in terms if term):
            seen.add(key)
            matched.append(canonical)

    return matched


def extract_job_skills(text: str) -> list[str]:
    """Extract known tech skills mentioned in job text."""
    if not text:
        return []
    text_lower = text.lower()
    found: list[str] = []
    seen: set[str] = set()

    for canonical in _ALL_CANONICAL:
        key = canonical.lower()
        if key in seen:
            continue
        terms = {canonical.lower()} | _SKILL_ALIASES.get(canonical, set())
        if any(_term_in_text(term, text_lower) for term in terms):
            seen.add(key)
            found.append(canonical)

    return found


def infer_skill_overlap(
    candidate_skills: list[str],
    job_text: str,
) -> tuple[list[str], list[str]]:
    """Rule-based matched + missing skills from job text."""
    matched = match_skills_in_text(candidate_skills, job_text)
    job_skills = extract_job_skills(job_text)
    candidate_keys = {
        _ALIAS_TO_CANONICAL.get(s.lower(), s).lower() for s in candidate_skills
    }
    missing = [s for s in job_skills if s.lower() not in candidate_keys]
    return matched, missing
