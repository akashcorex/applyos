# Outreach Autometer

Nx monorepo for the outreach platform: Next.js web app, Node API, Python agent services, and shared TypeScript packages.

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [Node.js](https://nodejs.org/) | 24.16.0 LTS or newer | JavaScript compatibility baseline for web/API tooling |
| [Bun](https://bun.sh/) | 1.3.14 or newer | JavaScript runtime, package install, workspace scripts |
| [npm](https://www.npmjs.org/) | 11.16.0 or newer | Fallback package runner for Nx commands |
| [Python](https://www.python.org/) | 3.14.5 latest stable; `.python-version` currently pins 3.12 | Python agent apps |

Version check last updated: June 3, 2026.

Optional: [Nx Console](https://nx.dev/getting-started/editor-integration) in your editor.

---

## Repository layout

```
outreach-autometer/
├── apps/
│   ├── web/                 # Next.js + Tailwind + TypeScript
│   ├── api/                 # Bun + Express + TypeScript
│   ├── ai-orchestrator/     # Python + FastAPI
│   ├── job-agent/           # Python + FastAPI
│   ├── apply-agent/         # Python + FastAPI
│   └── outreach-agent/      # Python + FastAPI
├── packages/                # Shared libraries (scaffolded)
│   ├── database/
│   ├── logger/
│   ├── queue/
│   ├── sdk/
│   ├── types/
│   └── ui/
├── infra/                   # Infrastructure (placeholder)
├── docs/                    # Documentation (placeholder)
├── .venv/                   # Single shared Python venv (local, not committed)
├── bun.lock                 # Bun lockfile for JavaScript dependencies
└── package.json             # Root workspace + scripts
```

---

## First-time setup (full monorepo)

### 1. Clone the repository

```bash
git clone <repository-url>
cd outreach-autometer
```

### 2. Install JavaScript dependencies with Bun

From the **repository root**:

```bash
bun install
```

This installs root dev tools (Nx, ESLint, TypeScript, etc.) and links workspaces under `apps/*` and `packages/*`.

### 3. Nx

Nx is already configured via `nx.json` and per-project `project.json` / `package.json` files. You do not install Nx globally; use `bun nx` or the package scripts below.

Useful commands:

```bash
bun nx show projects          # list all projects
bun nx graph                  # dependency graph (opens in browser)
bun nx run-many -t lint       # lint everything that defines lint
```

The `.nx/` folder is created locally when you run Nx (cache, workspace metadata). It is **gitignored** — do not commit it.

### 4. Python (shared virtual environment)

All Python apps share **one** venv at the repo root. Each app still has its own `requirements.txt` so you can see (and deploy) only what that service needs.

From the **repository root**:

```bash
python3 -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
```

Install dependencies:

```bash
# One-off packages while developing
pip install <package-name>

# Everything a single app needs (run from that app folder)
cd apps/job-agent
pip install -r requirements.txt
cd ../..
```

Repeat `pip install -r requirements.txt` for each Python app you work on. You only need to install what you use; there is no custom install script in this repo.

### 5. Environment variables (per app)

Each application has **its own** `.env` file. Do not use one root `.env` for everything.

| App | Env file location | Notes |
|-----|-------------------|--------|
| Web | `apps/web/.env.local` | [Next.js env convention](https://nextjs.org/docs/app/building-your-application/configuring/environment-variables) |
| API | `apps/api/.env` | e.g. `PORT`, `HOST` |
| Python agents | `apps/<agent>/.env` | e.g. `PORT`, API keys |

Copy from an example when you add one:

```bash
cp apps/api/.env.example apps/api/.env
```

`.env` files are gitignored. Commit `.env.example` templates only (no secrets).

---

## Running applications

All commands below are run from the **repository root**.

### Development

| Command | App | Default URL |
|---------|-----|-------------|
| `bun run dev:web` | Next.js frontend | http://localhost:3000 |
| `bun run dev:api` | Express API | http://localhost:3333 |
| `bun run dev:ai-orchestrator` | FastAPI | http://127.0.0.1:8001 |
| `bun run dev:job-agent` | FastAPI | http://127.0.0.1:8002 |
| `bun run dev:apply-agent` | FastAPI | http://127.0.0.1:8003 |
| `bun run dev:outreach-agent` | FastAPI | http://127.0.0.1:8004 |

Python apps use the root `.venv` automatically (`bun run dev:*` does not require you to activate the venv first).

FastAPI interactive docs: `http://127.0.0.1:<port>/docs`

Equivalent Nx commands:

```bash
bun nx dev @org/web
bun nx serve @org/api
bun nx serve job-agent
```

### Production build (TypeScript apps)

| Command | Description |
|---------|-------------|
| `bun run build:web` | Next.js production build |
| `bun run build:api` | Bundle API with esbuild |
| `bun run build:apps` | Build web + API together |

Python agents do not have a `build` target yet; deploy them with their folder `requirements.txt` and runtime of your choice.

---

## Working on a single app only

You can set up **only** what you need.

### TypeScript apps (`web`, `api`)

1. Clone repo and run `bun install` at the root (required for Nx and workspace linking).
2. Create that app’s env file (see table above).
3. Run dev:

   ```bash
   bun run dev:web
   # or
   bun run dev:api
   ```

You do not need Python or `.venv` if you are not touching Python apps.

### One Python agent (e.g. `job-agent`)

1. Clone repo and run `bun install` at the root (for `bun run dev:job-agent`).
2. Create root venv and activate:

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install **only** that app’s dependencies:

   ```bash
   cd apps/job-agent
   pip install -r requirements.txt
   cd ../..
   ```

4. Create `apps/job-agent/.env` if needed.
5. Run:

   ```bash
   bun run dev:job-agent
   ```

Other agents’ `requirements.txt` files can stay uninstalled until you need them.

### Shared packages only

1. `bun install` at root.
2. Implement code under `packages/<name>/`.
3. Link into an app when ready (see below).

---

## Using shared packages (`packages/`)

Shared libraries live under `packages/` and are published in the workspace as `@org/<name>`:

| Package | Import name |
|---------|-------------|
| database | `@org/database` |
| logger | `@org/logger` |
| queue | `@org/queue` |
| sdk | `@org/sdk` |
| types | `@org/types` |
| ui | `@org/ui` |

Packages are empty scaffolds today; once they export code, consume them from TypeScript apps like this.

### 1. Add a workspace dependency

From the **repository root**, add the package to an app (example: web needs types):

Edit `apps/web/package.json` manually:

```json
{
  "dependencies": {
    "@org/types": "*"
  }
}
```

Then run `bun install` again at the root.

### 2. Import in code

**Next.js (`apps/web`):**

```ts
import { something } from '@org/types';
```

**Express API (`apps/api`):**

```ts
import { something } from '@org/types';
```

Ensure the shared package exposes entry points (e.g. `src/index.ts` and `package.json` `"exports"`) when you add implementation.

### 3. Nx boundaries

TypeScript apps are checked by `@nx/enforce-module-boundaries` in `eslint.config.mjs`. Prefer depending on `packages/*` through `@org/*` workspace names, not deep relative paths into `packages/`.

### Python apps and `packages/`

Python agents do **not** import `@org/*` npm packages directly. Share logic via:

- HTTP calls to `api` or other agents, or
- Future Python packages / copy-shared-modules patterns you add later.

---

## Per-app reference

### `apps/web` — `@org/web`

- **Stack:** Next.js 16, React, Tailwind, TypeScript, Bun scripts
- **Env:** `apps/web/.env.local`
- **Dev / build:** `bun run dev:web`, `bun run build:web`

### `apps/api` — `@org/api`

- **Stack:** Bun runtime target, Express, TypeScript, esbuild
- **Env:** `apps/api/.env` (`HOST`, `PORT` default to `localhost` / `3333`)
- **Dev / build:** `bun run dev:api`, `bun run build:api`

### Python agents

| Project | Port | `requirements.txt` |
|---------|------|------------------|
| `ai-orchestrator` | 8001 | `apps/ai-orchestrator/requirements.txt` |
| `job-agent` | 8002 | `apps/job-agent/requirements.txt` |
| `apply-agent` | 8003 | `apps/apply-agent/requirements.txt` |
| `outreach-agent` | 8004 | `apps/outreach-agent/requirements.txt` |

- **Entry:** `main.py` (FastAPI `app`)
- **Env:** `apps/<agent>/.env`
- **Dev:** `bun run dev:<agent-name>`

---

## Common tasks

| Task | Command |
|------|---------|
| Install JavaScript deps | `bun install` |
| List Nx projects | `bun nx show projects` |
| Lint | `bun nx run-many -t lint` |
| Format | `bun nx format:write` |
| Create Python venv | `python3 -m venv .venv` |
| Activate venv | `source .venv/bin/activate` |
| Install app Python deps | `cd apps/<app> && pip install -r requirements.txt` |

---

## Troubleshooting

**`bun run dev:*` fails for Python — `.venv` missing**

```bash
python3 -m venv .venv
cd apps/<your-app> && pip install -r requirements.txt
```

**Port already in use**

Change `PORT` in that app’s `.env`, or stop the other process using the port.

**Cannot resolve `@org/types`**

Run `bun install` from the repo root after adding the dependency to the app’s `package.json`.

**Nx cache issues**

```bash
bun nx reset
```

---

## License

MIT
