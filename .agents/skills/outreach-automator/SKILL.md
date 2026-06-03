# Outreach Autometer — Project Agent Context

> This file is the authoritative context for AI agents working in this repo.
> Read it fully before making any decisions about architecture, naming, conventions, or tooling.

---

## 1. Project Vision

Outreach Autometer is an **outreach automation platform** that handles the full lifecycle of job hunting and outreach coordination:

1. **Discover** relevant jobs automatically (`job-agent`)
2. **Apply** intelligently to selected jobs (`apply-agent`)
3. **Send and track outreach** to people at target companies (`outreach-agent`)
4. **Orchestrate** the above agents so they collaborate without the user manually chaining them (`ai-orchestrator`)
5. **Expose** a clean web UI for users to track everything and steer the system (`apps/web`)
6. **Provide** a single HTTP API that all frontends and agents talk to (`apps/api`)

The user drives intent through the web UI; the agents do the work autonomously in the background.

---

## 2. Repository Layout

```
outreach-autometer/
├── apps/
│   ├── web/                 # Next.js 16 + React 19 + Tailwind — user-facing UI
│   ├── api/                 # Bun + Express — the single HTTP API / backend
│   ├── ai-orchestrator/     # Python + FastAPI — coordinates all agents
│   ├── job-agent/           # Python + FastAPI — discovers and filters jobs
│   ├── apply-agent/         # Python + FastAPI — drafts and submits applications
│   └── outreach-agent/      # Python + FastAPI — sends and tracks outreach messages
├── packages/                # Shared TypeScript libraries (workspace-linked via @org/*)
│   ├── database/            # @org/database — DB client, schema, migrations (PostgreSQL + Drizzle)
│   ├── logger/              # @org/logger — structured logging shared across TS apps
│   ├── queue/               # @org/queue — job queue abstraction (Redis-backed)
│   ├── sdk/                 # @org/sdk — typed HTTP client for inter-service calls
│   ├── types/               # @org/types — shared TypeScript types and Zod schemas
│   └── ui/                  # @org/ui — shared React component library
├── infra/                   # Infrastructure as Code (placeholder)
├── docs/                    # Architecture docs (placeholder)
├── .agents/                 # Agent context and skills (this folder)
│   ├── project.agent.md     # This file — overall project context
│   └── skills/              # Task-specific agent skills
│       ├── scaffold-feature/
│       ├── database/
│       └── python-agent/
├── .venv/                   # Single shared Python venv (local only, gitignored)
├── bun.lock                 # Bun lockfile — commit this, do not delete
└── package.json             # Root workspace — Bun workspaces + Nx scripts
```

---

## 3. Runtime Stack

### JavaScript / TypeScript

| Layer | Tool | Version |
|-------|------|---------|
| Runtime | Bun | 1.3.14+ |
| Package manager | Bun | 1.3.14+ |
| Node compatibility baseline | Node.js | 24.16.0 LTS |
| Monorepo task runner | Nx | 22.7.5 |
| Fallback script runner | npm | 11.16.0+ |

**Use `bun` for all installs and script execution.** Nx is invoked through Bun: `bun nx <target>`. Never use `npx nx` or `npm run` in new work.

### Python

| Layer | Tool | Version |
|-------|------|---------|
| Interpreter | CPython | 3.12 (`.python-version` pin; latest stable is 3.14.5) |
| Web framework | FastAPI | 0.115.0+ |
| ASGI server | uvicorn[standard] | 0.32.0+ |
| Virtual env | one shared `.venv` at repo root | activated per-app by Nx |

All Python agents share a single `.venv`. Each agent keeps its own `requirements.txt` for deployment isolation.

---

## 4. App Reference

### `apps/web` — `@org/web`

| Property | Value |
|----------|-------|
| Purpose | User-facing dashboard — job status, applications, outreach tracking |
| Stack | Next.js 16, React 19, Tailwind CSS, TypeScript |
| Entry | `apps/web/src/app/` (App Router) |
| Env file | `apps/web/.env.local` |
| Dev | `bun run dev:web` → http://localhost:3000 |
| Build | `bun run build:web` |
| Nx target | `bun nx dev @org/web` |

**Rules for web:**
- Fetch all data from `apps/api` — never call Python agents directly from the browser.
- Use `@org/types` for shared request/response shapes.
- Use `@org/ui` for shared components once that package is implemented.

---

### `apps/api` — `@org/api`

| Property | Value |
|----------|-------|
| Purpose | Single HTTP API; the only service the web app and agents call directly |
| Stack | Bun runtime, Express 4, TypeScript, esbuild |
| Entry | `apps/api/src/main.ts` |
| Env file | `apps/api/.env` (`HOST`, `PORT` — default `localhost:3333`) |
| Dev | `bun run dev:api` → http://localhost:3333 |
| Build | `bun run build:api` (output: `apps/api/dist/`) |
| Nx target | `bun nx serve @org/api` |

**Rules for api:**
- All business logic and DB access lives here, not in the web or agent apps.
- Use `@org/database` for all Postgres queries.
- Use `@org/logger` for structured request logging.
- Use `@org/queue` to push jobs to agents rather than calling them synchronously.
- Expose versioned routes: `/v1/...`

---

### `apps/ai-orchestrator` — `ai-orchestrator`

| Property | Value |
|----------|-------|
| Purpose | Coordinates `job-agent`, `apply-agent`, `outreach-agent`; decides sequencing |
| Stack | Python 3.12, FastAPI, uvicorn |
| Entry | `apps/ai-orchestrator/main.py` |
| Port | 8001 |
| Env file | `apps/ai-orchestrator/.env` |
| Dev | `bun run dev:ai-orchestrator` |
| Nx target | `bun nx serve ai-orchestrator` |

**Responsibilities:** workflow state machine, retry logic, agent health checks.

---

### `apps/job-agent` — `job-agent`

| Property | Value |
|----------|-------|
| Purpose | Discovers, filters, and ranks job listings from external sources |
| Stack | Python 3.12, FastAPI, uvicorn |
| Entry | `apps/job-agent/main.py` |
| Port | 8002 |
| Env file | `apps/job-agent/.env` |
| Dev | `bun run dev:job-agent` |

---

### `apps/apply-agent` — `apply-agent`

| Property | Value |
|----------|-------|
| Purpose | Drafts cover letters, fills forms, submits applications |
| Stack | Python 3.12, FastAPI, uvicorn |
| Entry | `apps/apply-agent/main.py` |
| Port | 8003 |
| Env file | `apps/apply-agent/.env` |
| Dev | `bun run dev:apply-agent` |

---

### `apps/outreach-agent` — `outreach-agent`

| Property | Value |
|----------|-------|
| Purpose | Finds contacts, drafts personalised outreach, sends and tracks replies |
| Stack | Python 3.12, FastAPI, uvicorn |
| Entry | `apps/outreach-agent/main.py` |
| Port | 8004 |
| Env file | `apps/outreach-agent/.env` |
| Dev | `bun run dev:outreach-agent` |

---

## 5. Shared Packages (`packages/`)

All packages are consumed as `@org/<name>` workspace imports. They are empty scaffolds today — implement them only when an app has a concrete need.

| Package | Import | Intended responsibility |
|---------|--------|------------------------|
| `@org/database` | `import { db } from '@org/database'` | Drizzle ORM client, PostgreSQL schema, migrations |
| `@org/logger` | `import { logger } from '@org/logger'` | Pino-based structured logger, request ID propagation |
| `@org/queue` | `import { enqueue } from '@org/queue'` | Redis-backed BullMQ job queues for agent tasks |
| `@org/sdk` | `import { ApiClient } from '@org/sdk'` | Typed fetch client for all inter-service HTTP calls |
| `@org/types` | `import type { Job } from '@org/types'` | Zod schemas + inferred TS types shared across web/api |
| `@org/ui` | `import { Button } from '@org/ui'` | Reusable React components, design tokens |

**Rules for packages:**
- Export everything from a single `src/index.ts`.
- Include a `"exports"` field in `package.json` pointing to `src/index.ts`.
- Python agents do not import from `@org/*` — they use HTTP or future Python-native modules.

---

## 6. Database Decision

**Primary store: PostgreSQL.**

Use `@org/database` with **Drizzle ORM** for the TypeScript API. Drizzle is Bun-native, schema-first, and has zero magic.

**Supporting stores:**

| Store | Role |
|-------|------|
| PostgreSQL | System of record: users, jobs, applications, campaigns, agent run log |
| Redis | BullMQ queues (via `@org/queue`), short-lived cache, rate limits |
| PostgreSQL `jsonb` | LLM/tool output payloads — avoids a separate document store |
| `pgvector` (later) | Semantic job matching, embedding search |
| Object storage (S3/R2) | Resumes, attachments, exports |

**Never use MongoDB or another document DB as the primary store.** Relational integrity across users → jobs → applications → outreach is the backbone of this platform.

---

## 7. Cross-Service Communication

```
Browser
  └─► apps/web  (Next.js)
        └─► apps/api  (Express/Bun)  ─── PostgreSQL
              └─► Redis queue (BullMQ via @org/queue)
                    └─► apps/ai-orchestrator  (FastAPI)
                          ├─► apps/job-agent       (FastAPI)
                          ├─► apps/apply-agent     (FastAPI)
                          └─► apps/outreach-agent  (FastAPI)
```

- The web app **never** calls Python agents directly.
- The API **pushes work to agents via queue** for async tasks; it may call agents directly for synchronous queries only when latency matters.
- Agents **report results back through the API** (HTTP POST), not by writing directly to the DB.
- Agent-to-agent calls go through `ai-orchestrator` — agents do not call each other directly.

---

## 8. Nx Monorepo Rules

- Always run tasks through Nx: `bun nx <target> <project>` or `bun nx run-many -t <target>`.
- Project names: TypeScript apps use `@org/<name>`, Python apps use bare names (`job-agent`, etc.).
- Module boundaries: enforced by `@nx/enforce-module-boundaries` in ESLint — respect tag constraints.
- Tags on TypeScript apps: `type:app`. Tags on packages: `type:lib`. Python apps: `type:app, lang:python`.
- Never import across boundaries using relative paths (e.g. `../../packages/types/src`). Use `@org/types`.
- Cache outputs are under `.nx/` — gitignored. Run `bun nx reset` if cache is stale.

---

## 9. Development Conventions

### TypeScript

- Strict TypeScript (`strict: true`).
- Zod for runtime validation of all external inputs (API request bodies, env vars).
- No `any` types. Use `unknown` then narrow.
- Prefer `async/await` over callbacks. No raw `.then()` chains.
- File naming: `kebab-case.ts`, component files: `PascalCase.tsx`.

### Python

- Type hints on all functions (`def foo(x: str) -> dict[str, str]`).
- Pydantic v2 models for all FastAPI request/response shapes.
- One `main.py` per agent as the FastAPI entry point.
- Keep agents stateless — persist state to the API/DB, not in agent memory.

### Git

- Branch naming: `feat/`, `fix/`, `chore/`, `docs/` prefixes.
- Commit messages: imperative present tense, e.g. `add job discovery endpoint`.
- One logical change per commit.

### Environment variables

- Each app has its own `.env` (or `.env.local` for Next.js). No shared root `.env`.
- Commit `.env.example` with placeholder values. Never commit real secrets.
- Validate env vars at startup with Zod (`z.object({ PORT: z.coerce.number() })`) in TypeScript apps.

---

## 10. Agent Working Rules

These rules apply to every AI agent working in this repo:

1. **Read this file before doing anything.** If you have not read it, read it now.
2. **Use Bun** for all JavaScript package management and script execution.
3. **Run tasks through Nx** — do not bypass it with direct tool invocations.
4. **Never write to the DB from Python agents** — they call the API over HTTP.
5. **Implement packages only when there is a concrete consumer** — do not pre-build empty abstractions.
6. **Add `.env.example`** alongside any new `.env` you reference in code.
7. **Update `README.md`** whenever setup steps, ports, commands, or tools change.
8. **Update this file** whenever the architecture, conventions, or database decisions change.
9. **Use `@org/types` Zod schemas** for all validated types shared between web and API.
10. **Tag new Nx projects** with the correct `type:` and `lang:` tags from day one.

---

## 11. Port Map

| Service | Port |
|---------|------|
| `apps/web` | 3000 |
| `apps/api` | 3333 |
| `apps/ai-orchestrator` | 8001 |
| `apps/job-agent` | 8002 |
| `apps/apply-agent` | 8003 |
| `apps/outreach-agent` | 8004 |
| Redis | 6379 (default) |
| PostgreSQL | 5432 (default) |

---

## 12. Current State vs Intended State

| Area | Current state | Intended state |
|------|--------------|----------------|
| Python agents | Health-check stubs only | Full business logic per agent |
| `packages/*` | Empty scaffolds | Implemented with exports |
| Database | Not connected | PostgreSQL + Drizzle via `@org/database` |
| Queue | Not connected | Redis + BullMQ via `@org/queue` |
| Auth | Not implemented | JWT or session-based, enforced in `apps/api` |
| Infra | Placeholder folder | Docker Compose for local, IaC for production |
| Tests | Not present | Unit + integration per app, e2e for web |

---

## 13. Skills in This Folder

Skills are task-specific agent guides. Read the relevant one before starting that category of work.

| Skill | When to use |
|-------|-------------|
| `.agents/skills/scaffold-feature/SKILL.md` | Adding a new end-to-end feature (web + API + agent) |
| `.agents/skills/database/SKILL.md` | Setting up or extending the PostgreSQL schema and queries |
| `.agents/skills/python-agent/SKILL.md` | Building or extending a Python FastAPI agent service |
