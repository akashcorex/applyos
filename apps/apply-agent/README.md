# apply-agent

`apply-agent` is the automated job application service (port 8003). Given a job URL and CV data, it launches a stealth browser, detects the ATS provider, fills the form via LLM-powered field mapping, and submits the application.

## What it does

- **Browser automation** — uses Playwright with stealth anti-detection to fill and submit job applications
- **ATS detection** — identifies the ATS provider (Greenhouse, Lever, Ashby, Workday, LinkedIn Easy Apply, or generic) by URL pattern and page content
- **Field mapping** — uses Claude Sonnet 4.6 to map job form fields to CV data fields
- **Screening questions** — generates answers to screening/knockout questions via LLM
- **Human-like interaction** — realistic typing delays, click patterns, and mouse movements to avoid bot detection
- **Result publishing** — pushes apply results to a shared Redis queue for the orchestrator to consume
- **LinkedIn connect/follow** — sends connection requests and follow actions with per-user daily rate limiting
- **Session persistence** — stores browser sessions (cookies, local storage) in Redis to maintain LinkedIn login across restarts

## Supported ATS handlers

| ATS | Handler | Approach |
|-----|---------|----------|
| Greenhouse | `GreenhouseHandler` | Full support: React Select comboboxes, resume upload, phone normalization, validation error detection |
| Lever | `LeverHandler` | Standard form filling |
| Ashby | `AshbyHandler` | Standard form filling |
| Workday | `WorkdayHandler` | Multi-step wizard forms with `data-automation-id` selectors |
| LinkedIn Easy Apply | `EasyApplyHandler` | Multi-page modal flow with screening questions |
| Generic (fallback) | `GenericHandler` | LLM-driven field mapping when no specialized handler matches |

## Request flow

1. `POST /admin/trigger/apply` enqueues a Celery task
2. Celery worker picks up the task
3. `apply_worker.py` launches a stealth Chromium browser
4. `detector.py` identifies the ATS handler (URL check first, then page sniffing)
5. The ATS handler extracts all form fields from the page
6. LLM maps form fields to CV data (`app/llm/field_mapper.py`)
7. LLM generates answers to screening questions (`app/llm/answer_generator.py`)
8. The handler fills the form with human-like delays and submits
9. Result is published to Redis `results_queue`
10. Retry logic retries up to 3 times for transient errors (60s delay)

## API endpoints

### Health

- `GET /` — service status
- `GET /health` — health check (probes Redis)

### Admin

- `POST /admin/trigger/apply` — enqueue an apply task (returns `task_id`, `job_id`)
- `POST /admin/trigger/connect` — enqueue a LinkedIn connect/follow batch
- `GET /admin/status/workers` — Redis queue depths and Celery worker info
- `POST /admin/enqueue/apply` — (testing) push raw job directly to Redis `jobs_queue`
- `POST /admin/enqueue/connect` — (testing) push raw contacts directly to Redis `contacts_queue`

## Local config

The app reads environment values from `apps/apply-agent/.env`.

Key settings:
- `REDIS_URL` — default `redis://127.0.0.1:6379/0`
- `ANTHROPIC_API_KEY` — Claude API key for LLM field mapping
- `API_URL` — default `http://localhost:3333`
- `DEFAULT_RESUME_PATH`
- `LINKEDIN_CONNECTS_PER_DAY` — default `20`
- `LINKEDIN_FOLLOWS_PER_DAY` — default `40`

See `.env.example` for the full list.

## Run locally

From the repository root:

```bash
bun nx run apply-agent:serve
```

Or from the app directory:

```bash
cd apps/apply-agent
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8003
```

The service will be available at `http://127.0.0.1:8003`.

## Test locally

```bash
bun nx run apply-agent:test
```

Or from the app directory:

```bash
cd apps/apply-agent
uv run pytest -q
```

## Implementation notes

- `app/ats/` — ATS handler implementations (one per supported ATS)
- `app/ats/detector.py` — URL-first, then page-content ATS detection
- `app/browser/` — Playwright engine, session manager, human delay helpers, resume upload, CAPTCHA detection
- `app/llm/` — Claude integration for field mapping and screening question answering
- `app/linkedin/` — LinkedIn connect, follow, profile loading, and rate limiting
- `app/workers/` — Celery workers for apply and connect tasks
- `app/events/publisher.py` — publishes result events to Redis `results_queue`

## Dependencies

- Redis (Celery broker/backend, session storage, rate limiting, results queue)
- Claude API (Anthropic) for LLM field mapping
- Playwright + Chromium for browser automation
