---
name: python-agent
description: Use when building or extending a Python FastAPI agent service. Triggers include "add an endpoint to job-agent", "implement discovery logic", "build apply-agent logic", "add a new Python agent", "extend outreach-agent", "add orchestration", or any task inside apps/ai-orchestrator, apps/job-agent, apps/apply-agent, or apps/outreach-agent.
---

# python-agent

Patterns and conventions for building Python FastAPI agent services in Outreach Autometer.

---

## Agent responsibilities (know before you code)

| Agent | What it does | Does NOT do |
|-------|-------------|-------------|
| `ai-orchestrator` | Sequences and retries the other agents; owns the workflow state machine | Business logic of discovery/apply/outreach |
| `job-agent` | Scrapes/fetches job listings, filters, ranks, deduplicates | Apply to jobs, contact people |
| `apply-agent` | Drafts cover letters, fills application forms, submits | Discover jobs, send outreach |
| `outreach-agent` | Finds contacts, drafts personalised messages, sends, tracks replies | Apply to jobs, discover listings |

Each agent is **stateless**. It receives a task, does work, calls the API to persist results, and returns a response. It does not hold state in memory between requests.

---

## File structure per agent

```
apps/<agent-name>/
├── main.py              # FastAPI app entry point — keep this thin
├── routes/
│   └── <domain>.py      # one file per logical domain
├── services/
│   └── <domain>.py      # business logic, pure functions
├── models.py            # Pydantic request/response models
├── client.py            # HTTP client for calling apps/api
├── requirements.txt     # this agent's Python deps only
└── .env.example         # env var template, committed
```

---

## `main.py` pattern

Keep `main.py` minimal — only app instantiation, lifespan, and router registration:

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from routes.jobs import router as jobs_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup: init HTTP client, validate env, etc.
    yield
    # shutdown: close connections


app = FastAPI(title="job-agent", lifespan=lifespan)

app.include_router(jobs_router, prefix="/jobs")


@app.get("/")
def root() -> dict[str, str]:
    return {"service": "job-agent", "status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy"}
```

---

## Pydantic models (`models.py`)

All request/response shapes use Pydantic v2:

```python
# apps/job-agent/models.py
from pydantic import BaseModel, HttpUrl
from enum import Enum


class JobStatus(str, Enum):
    discovered = "discovered"
    shortlisted = "shortlisted"
    rejected = "rejected"


class DiscoverInput(BaseModel):
    user_id: str
    keywords: list[str]
    location: str | None = None
    max_results: int = 20


class DiscoveredJob(BaseModel):
    title: str
    company: str
    url: HttpUrl
    description: str | None = None


class DiscoverOutput(BaseModel):
    user_id: str
    jobs: list[DiscoveredJob]
    total_found: int
```

Rules:
- Use `BaseModel` for all payloads.
- Use `str | None = None` for optional fields.
- Use `HttpUrl` for URLs — Pydantic validates them automatically.
- Use `str(Enum)` pattern for status fields so they serialise as strings.

---

## Route pattern

```python
# apps/job-agent/routes/jobs.py
from fastapi import APIRouter, HTTPException
from models import DiscoverInput, DiscoverOutput
from services.discovery import run_discovery

router = APIRouter()


@router.post("/discover", response_model=DiscoverOutput)
async def discover(payload: DiscoverInput) -> DiscoverOutput:
    try:
        result = await run_discovery(payload)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return result
```

---

## Service layer pattern

Business logic lives in `services/`, never in route handlers:

```python
# apps/job-agent/services/discovery.py
import httpx
from models import DiscoverInput, DiscoverOutput, DiscoveredJob


async def run_discovery(payload: DiscoverInput) -> DiscoverOutput:
    jobs: list[DiscoveredJob] = []

    # 1. Call external job source (LinkedIn, Greenhouse, etc.)
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://some-job-api.example.com/search",
            params={"q": " ".join(payload.keywords), "limit": payload.max_results},
        )
        resp.raise_for_status()
        raw = resp.json()

    # 2. Map to internal model
    for item in raw.get("results", []):
        jobs.append(DiscoveredJob(
            title=item["title"],
            company=item["company"],
            url=item["url"],
        ))

    # 3. Report back to apps/api so it can persist
    await report_to_api(payload.user_id, jobs)

    return DiscoverOutput(user_id=payload.user_id, jobs=jobs, total_found=len(jobs))
```

---

## Calling `apps/api` from a Python agent

Agents report results to the API — they do not write to the DB themselves.

```python
# apps/job-agent/client.py
import os
import httpx

API_URL = os.environ.get("API_URL", "http://localhost:3333")


async def report_to_api(user_id: str, jobs: list) -> None:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{API_URL}/v1/jobs/bulk",
            json={"userId": user_id, "jobs": [j.model_dump() for j in jobs]},
        )
        resp.raise_for_status()
```

Add `API_URL` to the agent's `.env.example`:

```
API_URL=http://localhost:3333
```

---

## Environment variable pattern

Validate env vars at startup using Pydantic settings:

```python
# apps/job-agent/config.py
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    api_url: str = "http://localhost:3333"
    port: int = 8002
    host: str = "127.0.0.1"

    class Config:
        env_file = ".env"


settings = Settings()
```

Install `pydantic-settings`:

```bash
# In apps/job-agent/requirements.txt:
pydantic-settings>=2.0.0
```

---

## Adding a dependency

1. Add to `apps/<agent>/requirements.txt`:

```
httpx>=0.27.0
pydantic-settings>=2.0.0
```

2. Install into the shared venv:

```bash
source .venv/bin/activate
cd apps/job-agent
pip install -r requirements.txt
```

Do not add to other agents' `requirements.txt` unless they also need it.

---

## How `ai-orchestrator` calls agents

The orchestrator makes internal HTTP calls to each agent's FastAPI endpoint:

```python
# apps/ai-orchestrator/services/workflow.py
import httpx
import os

JOB_AGENT_URL = os.environ.get("JOB_AGENT_URL", "http://127.0.0.1:8002")
APPLY_AGENT_URL = os.environ.get("APPLY_AGENT_URL", "http://127.0.0.1:8003")
OUTREACH_AGENT_URL = os.environ.get("OUTREACH_AGENT_URL", "http://127.0.0.1:8004")


async def run_full_workflow(user_id: str, keywords: list[str]) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        # Step 1 — discover jobs
        discover_resp = await client.post(
            f"{JOB_AGENT_URL}/jobs/discover",
            json={"user_id": user_id, "keywords": keywords},
        )
        discover_resp.raise_for_status()

        # Step 2 — apply to shortlisted
        apply_resp = await client.post(
            f"{APPLY_AGENT_URL}/applications/submit",
            json={"user_id": user_id},
        )
        apply_resp.raise_for_status()

        return {"status": "workflow_complete"}
```

Add agent URLs to `apps/ai-orchestrator/.env.example`:

```
JOB_AGENT_URL=http://127.0.0.1:8002
APPLY_AGENT_URL=http://127.0.0.1:8003
OUTREACH_AGENT_URL=http://127.0.0.1:8004
```

---

## Nx project.json for a Python agent

Every agent needs a `project.json` so Nx can manage it:

```json
{
  "name": "job-agent",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/job-agent",
  "projectType": "application",
  "tags": ["type:app", "lang:python"],
  "targets": {
    "serve": {
      "continuous": true,
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/job-agent",
        "command": "../../.venv/bin/python -m uvicorn main:app --reload --host 127.0.0.1 --port 8002"
      }
    }
  }
}
```

Run via Bun/Nx: `bun nx serve job-agent` or `bun run dev:job-agent`.

---

## FastAPI interactive docs

Every agent exposes Swagger UI automatically:

| Agent | Docs URL |
|-------|----------|
| `ai-orchestrator` | http://127.0.0.1:8001/docs |
| `job-agent` | http://127.0.0.1:8002/docs |
| `apply-agent` | http://127.0.0.1:8003/docs |
| `outreach-agent` | http://127.0.0.1:8004/docs |

---

## Rules — do not break these

- Agents are stateless. All state is persisted via `apps/api`, not agent memory.
- Agents do not write to PostgreSQL directly.
- Agents do not call each other directly. All orchestration goes through `ai-orchestrator`.
- Always define Pydantic models for every request and response.
- Always validate env vars at startup (use `pydantic-settings`).
- Never hardcode URLs — always read from env vars.
- Each agent's `requirements.txt` lists only what that agent needs.
- Run the agent with uvicorn via `project.json` so Nx controls the lifecycle.
