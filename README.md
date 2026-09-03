# Outreach Autometer

AI-powered job application platform — a Turborepo monorepo with a Next.js frontend, Express API, and Python agent microservices.

## Architecture

```
                    ┌──────────────┐
                    │   Web App    │  Next.js (port 3000)
                    └──────┬───────┘
                           │ HTTP
                    ┌──────▼───────┐
                    │  API Server  │  Express (port 3333)
                    └──────┬───────┘
                           │ orchestrates
          ┌────────────────┼────────────────┐
          │                │                │
  ┌───────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
  │  Job Agent   │ │  Apply Agent │ │Outreach Agent│
  │  (port 8002) │ │  (port 8003) │ │  (port 8004) │
  └──────────────┘ └──────────────┘ └──────────────┘
          │                │                │
          └────────────────┼────────────────┘
                    ┌──────▼───────┐
                    │ Orchestrator │  Coordinates agents (port 8001)
                    └──────────────┘
```

## Stack

| Layer       | Technology                                                   |
| ----------- | ------------------------------------------------------------ |
| Monorepo    | Turborepo 2 + Bun                                            |
| Frontend    | Next.js 16, React 19, Tailwind CSS 3.4                       |
| API         | Express 4, TypeScript, esbuild                               |
| Agents      | Python 3.12, FastAPI, Uvicorn                                |
| Shared Libs | `@applyso/{database,logger,queue,sdk,types,ui}` (scaffolded) |

## Apps

| App                                        | Purpose                                                                             | README                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| **Web** (`apps/web`)                       | Next.js frontend — dashboard, workflows, settings                                   | [README](apps/web/README.md)             |
| **API** (`apps/api`)                       | Express backend — business logic, data layer, agent coordination                    | [README](apps/api/README.md)             |
| **Orchestrator** (`apps/ai-orchestrator`)  | Coordinates multi-agent workflows — state machine, job ingestion, apply dispatch    | [README](apps/ai-orchestrator/README.md) |
| **Job Agent** (`apps/job-agent`)           | Job discovery — ATS detection, job scraping, funding data                           | [README](apps/job-agent/README.md)       |
| **Apply Agent** (`apps/apply-agent`)       | Automated job application — browser automation, LLM field mapping, LinkedIn actions | [README](apps/apply-agent/README.md)     |
| **Resume Agent** (`apps/resume-agent`)     | Resume ingestion, IR revisions, evidence-constrained tailoring, PDF compilation     | [README](apps/resume-agent/README.md)    |
| **Outreach Agent** (`apps/outreach-agent`) | Outreach communications — emails, follow-ups, messaging (scaffold)                  | [README](apps/outreach-agent/README.md)  |

## Quick start

See **[LOCAL_DEV.md](./LOCAL_DEV.md)** for the full local setup (Postgres, Redis, all services, HITL worker, env, smoke test).

```bash
# Install JS deps
bun install

# Python setup (optional — only if working with agents)
python3 -m venv .venv
source .venv/bin/activate
cd apps/<agent> && pip install -r requirements.txt

# Run an app
bun run dev:web       # http://localhost:3000
bun run dev:api       # http://localhost:3333
bun run dev:job-agent # http://127.0.0.1:8002
```

## Commands

| Command                                      | Description                            |
| -------------------------------------------- | -------------------------------------- |
| `bun run dev:web`                            | Start Next.js frontend                 |
| `bun run dev:api`                            | Start Express API                      |
| `bun run dev:ai-orchestrator`                | Start orchestrator agent               |
| `bun run dev:job-agent`                      | Start job agent                        |
| `bun run dev:apply-agent`                    | Start apply agent                      |
| `bun run dev:outreach-agent`                 | Start outreach agent                   |
| `bun run build:web`                          | Production build (Next.js)             |
| `bun run build:api`                          | Production build (esbuild)             |
| `bunx turbo run build --filter=@applyso/web` | Build a single package                 |
| `bunx turbo run <task> --filter=<pkg>`       | Run any task in one package            |
| `bunx turbo run build --dry=json`            | Inspect the task graph without running |

## Shared packages

| Package             | Import              |
| ------------------- | ------------------- |
| `packages/database` | `@applyso/database` |
| `packages/logger`   | `@applyso/logger`   |
| `packages/queue`    | `@applyso/queue`    |
| `packages/sdk`      | `@applyso/sdk`      |
| `packages/types`    | `@applyso/types`    |
| `packages/ui`       | `@applyso/ui`       |

All are workspace-linked — import via `@applyso/<name>` after adding to your app's `package.json` and running `bun install`.

## Env files

| App    | File                  |
| ------ | --------------------- |
| Web    | `apps/web/.env.local` |
| API    | `apps/api/.env`       |
| Agents | `apps/<agent>/.env`   |

### Durable workflow configuration

Set the same high-entropy `AGENT_SERVICE_TOKEN` in `apps/web/.env.local`,
`apps/api/.env`, `apps/ai-orchestrator/.env`, `apps/resume-agent/.env`, and
`apps/apply-agent/.env`. It is used only for trusted server-to-server workflow
persistence and compiled artifact downloads; do not expose it through a
`NEXT_PUBLIC_` variable. The web service may also set `API_URL` and the
orchestrator may set `API_URL` when these services do not use their local
port defaults.

Apply the durable workflow migration before starting the services:

```bash
bun run db:migrate
```

## License

MIT
