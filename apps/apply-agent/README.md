# apply-agent

`apply-agent` is the automated job application service (port 8003). Given a job URL and CV data, it launches a stealth browser, detects the ATS provider, fills the form via LLM-powered field mapping, and submits the application.

## What it does

- **Browser automation** — uses Playwright with stealth anti-detection to fill and submit job applications
- **ATS detection** — identifies the ATS provider (Greenhouse, Lever, Ashby, Workable, Wellfound, Workday, LinkedIn Easy Apply, or generic) by URL pattern and page content
- **Field mapping** — uses Claude Sonnet 4.6 to map job form fields to CV data fields
- **Screening questions** — generates answers to screening/knockout questions via LLM
- **Human-like interaction** — realistic typing delays, click patterns, and mouse movements to avoid bot detection
- **Result publishing** — pushes apply results to a shared Redis queue for the orchestrator to consume
- **LinkedIn connect/follow** — sends connection requests and follow actions with per-user daily rate limiting
- **Post-apply employee connects** — after a successful apply, search company people on LinkedIn and send up to 3 blank connection requests
- **Session persistence** — stores browser sessions (cookies, local storage) in Redis to maintain LinkedIn login across restarts

## LinkedIn session bootstrap

Playwright needs a real LinkedIn cookie session (Better Auth OAuth is **not** enough).

```bash
cd apps/apply-agent
../../.venv/bin/python scripts/bootstrap_linkedin_session.py --user-id <USER_ID>
```

A headed browser opens — log in (and complete 2FA). When the feed loads, the script saves `session:<user_id>` to Redis (7-day TTL).

Check status: `GET /admin/linkedin/session/{user_id}` returns `has_session`, `linkedin_authenticated`, and `expires_in_seconds`.

If the session is missing or expired, connect/discover workers fail with `login_required` — re-run the bootstrap script.

### Wellfound session bootstrap

Native Wellfound apply uses your Wellfound profile (not a full form). Log in once:

```bash
cd apps/apply-agent
../../.venv/bin/python scripts/bootstrap_wellfound_session.py --user-id <USER_ID>
```

Many Wellfound listings link out to Greenhouse/Lever/etc. — those are handled automatically after redirect. Jobs with only Wellfound native apply need this session.

## Supported ATS handlers

| ATS                 | Handler             | Approach                                                                                                                                                            |
| ------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Greenhouse          | `GreenhouseHandler` | Full support: React Select comboboxes, resume upload, phone normalization, validation error detection                                                               |
| Lever               | `LeverHandler`      | Standard form filling                                                                                                                                               |
| Ashby               | `AshbyHandler`      | Standard form filling                                                                                                                                               |
| Workable            | `WorkableHandler`   | `/apply` + jobs.workable.com Apply now, resume upload, YES/NO radios, identity autofill, Cloudflare Turnstile (CapSolver / headed checkbox), thank-you confirmation |
| Wellfound           | `WellfoundHandler`  | Native modal apply (note + screening Qs) when logged in; auto-redirects to external ATS (Greenhouse/Lever/etc.) when listed                                         |
| Workday             | `WorkdayHandler`    | Multi-step wizard forms with `data-automation-id` selectors                                                                                                         |
| LinkedIn Easy Apply | `EasyApplyHandler`  | Multi-page modal flow with screening questions                                                                                                                      |
| Generic (fallback)  | `GenericHandler`    | LLM-driven field mapping when no specialized handler matches                                                                                                        |

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
- `POST /admin/tasks/{task_id}/cancel` — request cancellation of an apply task; requires `X-Agent-Service-Token`
- `POST /admin/trigger/connect` — enqueue a LinkedIn connect/follow batch
- `POST /admin/trigger/discover-connect` — search company employees + blank connects (post-apply)
- `GET /admin/linkedin/session/{user_id}` — whether a Redis Playwright session exists
- `GET /admin/status/workers` — Redis queue depths and Celery worker info
- `POST /admin/enqueue/apply` — (testing) push raw job directly to Redis `jobs_queue`
- `POST /admin/enqueue/connect` — (testing) push raw contacts directly to Redis `contacts_queue`

## Local config

The app reads environment values from `apps/apply-agent/.env`.

Key settings:

- `REDIS_URL` — default `redis://127.0.0.1:6379/0`
- `ANTHROPIC_API_KEY` — Claude API key for LLM field mapping
- `API_URL` — default `http://localhost:3333`
- `AGENT_SERVICE_TOKEN` — high-entropy token shared only with trusted backend services; required for cancellation and compiled resume artifact downloads
- `RESUME_AGENT_URL` — base URL used to download compiled resume artifacts
- `APPLY_CANCELLATION_TTL_SECONDS` — default `86400`; retains cancellation markers long enough to block delayed task retries
- A compiled `cv_data.resume_url` is required for every apply; local path fallbacks are not supported.
- `LINKEDIN_MAX_CONNECTS_PER_DAY` — default `20`
- `LINKEDIN_MAX_FOLLOWS_PER_DAY` — default `40`
- `POST_APPLY_LINKEDIN_CONNECT_ENABLED` — default `true`
- `POST_APPLY_CONNECT_LIMIT` — default `3`
- `POST_APPLY_CONNECT_DELAY_SECONDS` — default `900` (15 min before post-apply connects)

See `.env.example` for the full list.

## Run locally

From the repository root:

```bash
bun run dev:apply-agent
```

Or from the app directory:

```bash
cd apps/apply-agent
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8003
```

The service will be available at `http://127.0.0.1:8003`.

## Test locally

From the app directory:

```bash
cd apps/apply-agent
uv run pytest -q
```

## Implementation notes

- `app/ats/` — ATS handler implementations (one per supported ATS)
- `app/ats/detector.py` — URL-first, then page-content ATS detection
- `app/browser/` — Playwright engine, session manager, human delay helpers, resume upload, CAPTCHA detection
- `app/llm/` — Claude integration for field mapping and screening question answering
- `app/linkedin/` — LinkedIn connect, follow, company people discovery, profile loading, and rate limiting
- `app/workers/` — Celery workers for apply, connect, and discover-and-connect tasks
- `app/events/publisher.py` — publishes result events to Redis `results_queue`

## Dependencies

- Redis (Celery broker/backend, session storage, rate limiting, results queue)
- Claude API (Anthropic) for LLM field mapping
- Playwright + Chromium for browser automation
