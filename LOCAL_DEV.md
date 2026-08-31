# Local development guide

How to run the full ApplyOS stack on your machine, including Human-in-the-Loop (HITL) auto-apply with embedded live browser.

## What you are starting

| Service | Command | URL | Purpose |
| --- | --- | --- | --- |
| **Postgres + Redis** | `docker compose` | `:5432`, `:6379` | Database + queues/pub-sub |
| **Web** | `bun run dev:web` | http://localhost:3000 | Dashboard UI |
| **API** | `bun run dev:api` | http://localhost:3333 | Auth, workflows, applications |
| **AI Orchestrator** | `bun run dev:ai-orchestrator` | http://127.0.0.1:8001 | Workflow state machine |
| **Job Agent** | `bun run dev:job-agent` | http://127.0.0.1:8002 | Job discovery / ingest |
| **Apply Agent (API)** | `bun run dev:apply-agent` | http://127.0.0.1:8003 | Admin + live browser WebSocket |
| **Apply Agent (worker)** | see below | — | **Required** — runs Playwright/Celery |
| **Outreach Agent** | `bun run dev:outreach-agent` | http://127.0.0.1:8004 | Email outreach (optional) |
| **Resume Agent** | `bun run dev:resume-agent` | http://127.0.0.1:8005 | Resume parse / match / PDF |

For auto-apply + HITL you need at minimum: **Postgres, Redis, Web, API, Orchestrator, Resume Agent, Apply Agent (API + worker)**.

---

## Prerequisites

- **Bun** ≥ 1.3.12 and **Node** ≥ 20
- **Python** 3.12+ (3.14 works with the repo venv)
- **Docker** (for Postgres + Redis)
- **Google Chrome** (apply-agent uses `channel=chrome` for ATS forms)
- API keys (local dev):
  - `ANTHROPIC_API_KEY` — field mapping + resume agent
  - `OPENAI_API_KEY` — resume embeddings (resume-agent)

Optional: **uv** (`curl -LsSf https://astral.sh/uv/install.sh | sh`) for non–apply-agent Python services.

---

## One-time setup

### 1. Clone and install JS dependencies

```bash
bun install
```

### 2. Start infrastructure

From the repo root:

```bash
docker compose -f infra/docker-compose.yml up -d
```

This starts:

- Postgres (`postgresql://postgres:postgres@localhost:5432/outreach`) with pgvector
- Redis (`redis://localhost:6379/0`)

### 3. Python — apply-agent (root venv)

Apply-agent uses the shared venv at `.venv/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/apply-agent/requirements.txt
playwright install chrome
```

### 4. Python — other agents (uv)

```bash
bun run sync:agents
```

Or per agent: `bun run sync:job-agent`, `bun run sync:resume-agent`, etc.

### 5. Environment files

Copy examples and fill in secrets. **Use the same `AGENT_SERVICE_TOKEN` everywhere** (generate once, e.g. `openssl rand -hex 32`).

| File | Required keys |
| --- | --- |
| `apps/api/.env` | `DATABASE_URL`, `BETTER_AUTH_SECRET`, `AGENT_SERVICE_TOKEN`, LinkedIn OAuth if using login |
| `apps/web/.env.local` | `AGENT_SERVICE_TOKEN`, `API_URL`, optional `DEFAULT_RESUME_PATH` |
| `apps/ai-orchestrator/.env` | `AGENT_SERVICE_TOKEN`, `ANTHROPIC_API_KEY`, `API_URL`, `REDIS_URL` |
| `apps/apply-agent/.env` | `AGENT_SERVICE_TOKEN`, `ANTHROPIC_API_KEY`, `API_URL`, `REDIS_URL`, `RESUME_AGENT_URL` |
| `apps/resume-agent/.env` | `DATABASE_URL`, `AGENT_SERVICE_TOKEN`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| `apps/job-agent/.env` | `AGENT_SERVICE_TOKEN`, `DATABASE_URL` (if used) |

**Web auto-apply resume (optional):**

```bash
# apps/web/.env.local
DEFAULT_RESUME_PATH=/absolute/path/to/your/resume.pdf
```

**HITL apply-agent defaults** (`apps/apply-agent/.env`):

```bash
HITL_MODE=true
APPLY_HEADED=false          # headless in HITL — stream shows in dashboard, no desktop window
APPLY_USE_CHROME_CHANNEL=true
```

### 6. Database migrations

Migrations need `DATABASE_URL` (same as API):

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach bun run db:migrate
```

Or export it in your shell profile so `bun run db:migrate` works without the prefix.

---

## Starting services (daily dev)

Use **one terminal per service** (or a process manager like `overmind` / `tmux`).

**Recommended order:**

```bash
# Terminal 1 — already running via Docker
docker compose -f infra/docker-compose.yml up -d

# Terminal 2 — API (must be up before web auto-apply)
bun run dev:api

# Terminal 3 — Web
bun run dev:web

# Terminal 4 — Orchestrator
bun run dev:ai-orchestrator

# Terminal 5 — Resume agent
bun run dev:resume-agent

# Terminal 6 — Apply agent HTTP + WebSocket
bun run dev:apply-agent

# Terminal 7 — Apply agent Celery worker (DO NOT SKIP for auto-apply)
bunx turbo run worker --filter=apply-agent

# Optional
bun run dev:job-agent
bun run dev:outreach-agent
```

Open http://localhost:3000, sign in, and use **Auto-Apply** or the **Applications** tracker.

---

## HITL architecture (short)

Auto-apply uses **two apply-agent processes**:

1. **FastAPI (`dev:apply-agent`)** — admin resume / show-browser bridge to the worker
2. **Celery worker** — owns a **headed** Playwright Chrome window, fills the form once, and holds the same session while waiting for you

Shared-session flow:

1. Agent fills the application in headed Chrome
2. On CAPTCHA / Cloudflare / submit approval → status `waiting_for_human` (Attention queue)
3. Dashboard **Show browser** focuses that Chrome window — solve or review **there** (same cookies/DOM)
4. **Continue** / **Approve & Submit** resumes the agent; agent submits without re-filling

They communicate via **Redis pub/sub**:

- `screencast_input:{applicationId}` — show-browser / control-mode commands (UI → worker)
- `application:{applicationId}:resume` — user clicked Approve / Continue
- Optional debug stream: set `HITL_DEBUG_STREAM=true` on apply-agent and `NEXT_PUBLIC_HITL_DEBUG_STREAM=true` on web

Durable state (status, interventions, events) goes to **Postgres** through **apps/api**.

---

## Auto-submit vs manual approval

Settings → **Agent Preferences** → **Auto-submit applications without manual approval**

| Setting | Behavior |
| --- | --- |
| Off (default) | Agent fills the form, pauses at `waiting_for_human`, you review in the headed Chrome window and click **Approve & Submit** |
| On | Agent fills and submits without pausing |

---

## Smoke test (CLI)

From repo root, with services running:

```bash
# Default: auto-submit OFF, waits for your approval in the UI
.venv/bin/python scripts/hitl_smoke_test.py

# Auto-submit ON (no approval pause)
SMOKE_AUTO_SUBMIT=true .venv/bin/python scripts/hitl_smoke_test.py
```

Loads `resume.pdf` at repo root (or set `DEFAULT_RESUME_PATH` in web env).

---

## Health checks

```bash
curl -s http://localhost:3333/ | head -c 80
curl -s http://127.0.0.1:8001/health
curl -s http://127.0.0.1:8003/health
curl -s http://127.0.0.1:8005/health
redis-cli ping
```

Apply worker: look for `celery@... ready` in the worker terminal.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Jobs queue then vanish / `failed` immediately | Ensure API is running (`bun run dev:api`). Run migrations. |
| Apply does nothing | Start Celery worker: `bunx turbo run worker --filter=apply-agent` |
| Chrome window opens on desktop | Expected for HITL (shared session). For non-HITL headless, set `HITL_MODE=false` and `APPLY_HEADED=false` |
| Show browser does nothing | Restart apply-agent **and** Celery worker; ensure the application is `waiting_for_human` with an active session |
| Live browser connection failed | Live stream is debug-only (`HITL_DEBUG_STREAM` / `NEXT_PUBLIC_HITL_DEBUG_STREAM`). Prefer Show browser |
| `AGENT_SERVICE_TOKEN` / 503 on auto-apply | Same token in `apps/web/.env.local`, `apps/api/.env`, orchestrator, apply-agent |
| `db:migrate` fails with `url: undefined` | Pass `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach` |
| Resume parse fails | Resume agent running; `OPENAI_API_KEY` + `ANTHROPIC_API_KEY` set |
| LinkedIn connect tasks fail | Bootstrap session: `apps/apply-agent/scripts/bootstrap_linkedin_session.py` |

After changing apply-agent Python code, **restart the Celery worker** (it does not hot-reload like uvicorn).

---

## All-in-one (experimental)

Starts web + api + all agent HTTP servers (still **no** Celery worker):

```bash
bun run dev
```

You must still run the apply-agent worker separately for applications to execute.

---

## Related docs

- [README.md](./README.md) — monorepo overview
- [apps/apply-agent/README.md](./apps/apply-agent/README.md) — ATS handlers, LinkedIn bootstrap
- [apps/api/README.md](./apps/api/README.md) — API routes
- [apps/web/README.md](./apps/web/README.md) — frontend
