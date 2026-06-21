# ai-orchestrator

`ai-orchestrator` is the central workflow coordinator (port 8001). It accepts a high-level "apply for jobs" request, then orchestrates the full pipeline: discovering companies (via funding data or user-specified targets), ingesting jobs from those companies, filtering/ranking jobs against the user profile, triggering automated applications, and tracking results to completion.

## What it does

- **Workflow state machine** — manages workflow lifecycle: `pending → discovering → filtering → applying → completed/partial/failed`
- **Funding discovery** (optional) — scrapes recently funded companies via `job-agent`'s `POST /funding/scrape`
- **ATS detection** — probes each company's career page to identify its ATS provider via `job-agent`'s `POST /detect`
- **Job ingestion** — fetches open positions from each target company via `job-agent`'s `POST /ingest/{ats}`
- **Job filtering** — deduplicates, scores, and caps jobs by title relevance, location, and seniority match
- **Apply orchestration** — dispatches shortlisted jobs to `apply-agent`'s `POST /admin/trigger/apply`
- **Result consumption** — listens on a shared Redis `results_queue` for apply results, updates workflow state, and finalizes on completion or timeout

## Architecture

```
POST /workflows (user request)
        │
        ▼
  ┌─────────────────┐
  │  run_workflow() │  core state machine
  └────────┬────────┘
           │
     ┌─────┴──────┬──────────────┐
     ▼            ▼              ▼
  job-agent   apply-agent    Redis
  (8002)       (8003)      results_queue
```

## API endpoints

### Health

- `GET /` — service status
- `GET /health` — probes Redis, job-agent, apply-agent, and Celery worker count

### Workflows

- `POST /workflows` — start a new workflow (returns `202` with `workflow_id`)
- `GET /workflows/{workflow_id}` — get workflow status and results
- `GET /workflows` — list recent workflow IDs (up to 20)

## Local config

The app reads environment values from `apps/ai-orchestrator/.env`.

Key settings:
- `JOB_AGENT_URL` — default `http://127.0.0.1:8002`
- `APPLY_AGENT_URL` — default `http://127.0.0.1:8003`
- `REDIS_URL` — default `redis://127.0.0.1:6379/0`
- `WORKFLOW_TTL_SECONDS` — default `86400` (24h)
- `APPLY_RESULT_TIMEOUT_SECONDS` — default `3600` (1h)

See `.env.example` for the full list.

## Run locally

From the repository root:

```bash
bun nx run ai-orchestrator:serve
```

Or from the app directory:

```bash
cd apps/ai-orchestrator
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

The service will be available at `http://127.0.0.1:8001`.

## Test locally

```bash
bun nx run ai-orchestrator:test
```

Or from the app directory:

```bash
cd apps/ai-orchestrator
uv run pytest -q
```

## Implementation notes

- `services/workflow.py` — core state machine driving the pipeline
- `services/workflow_store.py` — Redis-backed CRUD for `WorkflowRun` objects
- `services/job_client.py` — HTTP client for job-agent
- `services/funding_client.py` — HTTP client for funding scraping
- `services/apply_client.py` — HTTP client for apply-agent
- `services/filter.py` — job dedup, scoring, and ranking logic
- `services/results_consumer.py` — background task consuming `results_queue` and finalizing workflows
- `routes/workflows.py` — workflow creation and status endpoints
- `routes/health.py` — health check endpoint

## Dependencies

- Redis (shared with apply-agent for result queue)
- job-agent (port 8002)
- apply-agent (port 8003)
