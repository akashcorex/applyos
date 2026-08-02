# Outreach Autometer.

AI-powered outreach automation platform — an Nx monorepo with a Next.js frontend, Express API, and four Python agent microservices.

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

| Layer | Technology |
|-------|-----------|
| Monorepo | Nx 22 + Bun |
| Frontend | Next.js 16, React 19, Tailwind CSS 3.4 |
| API | Express 4, TypeScript, esbuild |
| Agents | Python 3.12, FastAPI, Uvicorn |
| Shared Libs | `@org/{database,logger,queue,sdk,types,ui}` (scaffolded) |

## Apps

| App | Purpose | README |
|-----|---------|--------|
| **Web** (`apps/web`) | Next.js frontend — dashboard, workflows, settings | [README](apps/web/README.md) |
| **API** (`apps/api`) | Express backend — business logic, data layer, agent coordination | [README](apps/api/README.md) |
| **Orchestrator** (`apps/ai-orchestrator`) | Coordinates multi-agent workflows — state machine, job ingestion, apply dispatch | [README](apps/ai-orchestrator/README.md) |
| **Job Agent** (`apps/job-agent`) | Job discovery — ATS detection, job scraping, funding data | [README](apps/job-agent/README.md) |
| **Apply Agent** (`apps/apply-agent`) | Automated job application — browser automation, LLM field mapping, LinkedIn actions | [README](apps/apply-agent/README.md) |
| **Outreach Agent** (`apps/outreach-agent`) | Outreach communications — emails, follow-ups, messaging (scaffold) | [README](apps/outreach-agent/README.md) |

## Quick start

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

| Command | Description |
|---------|-------------|
| `bun run dev:web` | Start Next.js frontend |
| `bun run dev:api` | Start Express API |
| `bun run dev:ai-orchestrator` | Start orchestrator agent |
| `bun run dev:job-agent` | Start job agent |
| `bun run dev:apply-agent` | Start apply agent |
| `bun run dev:outreach-agent` | Start outreach agent |
| `bun run build:web` | Production build (Next.js) |
| `bun run build:api` | Production build (esbuild) |
| `bun nx show projects` | List all Nx projects |
| `bun nx run-many -t lint` | Lint all projects |

## Shared packages

| Package | Import |
|---------|--------|
| `packages/database` | `@org/database` |
| `packages/logger` | `@org/logger` |
| `packages/queue` | `@org/queue` |
| `packages/sdk` | `@org/sdk` |
| `packages/types` | `@org/types` |
| `packages/ui` | `@org/ui` |

All are workspace-linked — import via `@org/<name>` after adding to your app's `package.json` and running `bun install`.

## Env files

| App | File |
|-----|------|
| Web | `apps/web/.env.local` |
| API | `apps/api/.env` |
| Agents | `apps/<agent>/.env` |

## License

MIT
