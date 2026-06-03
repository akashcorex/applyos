# Outreach Autometer

Nx monorepo for the outreach platform: Next.js web app, Node API, Python agent services, and shared TypeScript packages.

## Prerequisites

| Tool | Version | Used for |
|------|---------|----------|
| [Node.js](https://nodejs.org/) | 20+ recommended | Web, API, Nx, npm workspaces |
| [npm](https://www.npmjs.org/) | 10+ (comes with Node) | Install and link packages |
| [Python](https://www.python.org/) | 3.12 (see `.python-version`) | Python agent apps |

Optional: [Nx Console](https://nx.dev/getting-started/editor-integration) in your editor.

---

## Repository layout

```
outreach-autometer/
├── apps/
│   ├── web/                 # Next.js + Tailwind + TypeScript
│   ├── api/                 # Node + Express + TypeScript
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
└── package.json             # Root workspace + npm scripts
```

---

## First-time setup (full monorepo)

### 1. Clone the repository

```bash
git clone <repository-url>
cd outreach-autometer
```

### 2. Install Node dependencies

From the **repository root**:

```bash
npm install
```

This installs root dev tools (Nx, ESLint, TypeScript, etc.) and links npm workspaces under `apps/*` and `packages/*`.

### 3. Nx

Nx is already configured via `nx.json` and per-project `project.json` / `package.json` files. You do not install Nx globally; use `npx nx` or the npm scripts below.

Useful commands:

```bash
npx nx show projects          # list all projects
npx nx graph                  # dependency graph (opens in browser)
npx nx run-many -t lint       # lint everything that defines lint
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
| `npm run dev:web` | Next.js frontend | http://localhost:3000 |
| `npm run dev:api` | Express API | http://localhost:3333 |
| `npm run dev:ai-orchestrator` | FastAPI | http://127.0.0.1:8001 |
| `npm run dev:job-agent` | FastAPI | http://127.0.0.1:8002 |
| `npm run dev:apply-agent` | FastAPI | http://127.0.0.1:8003 |
| `npm run dev:outreach-agent` | FastAPI | http://127.0.0.1:8004 |

Python apps use the root `.venv` automatically (`npm run dev:*` does not require you to activate the venv first).

FastAPI interactive docs: `http://127.0.0.1:<port>/docs`

Equivalent Nx commands:

```bash
npx nx dev @org/web
npx nx serve @org/api
npx nx serve job-agent
```

### Production build (TypeScript apps)

| Command | Description |
|---------|-------------|
| `npm run build:web` | Next.js production build |
| `npm run build:api` | Bundle API with esbuild |
| `npm run build:apps` | Build web + API together |

Python agents do not have a `build` target yet; deploy them with their folder `requirements.txt` and runtime of your choice.

---

## Working on a single app only

You can set up **only** what you need.

### TypeScript apps (`web`, `api`)

1. Clone repo and run `npm install` at the root (required for Nx and workspace linking).
2. Create that app’s env file (see table above).
3. Run dev:

   ```bash
   npm run dev:web
   # or
   npm run dev:api
   ```

You do not need Python or `.venv` if you are not touching Python apps.

### One Python agent (e.g. `job-agent`)

1. Clone repo and run `npm install` at the root (for `npm run dev:job-agent`).
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
   npm run dev:job-agent
   ```

Other agents’ `requirements.txt` files can stay uninstalled until you need them.

### Shared packages only

1. `npm install` at root.
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

```bash
npm install @org/types --workspace apps/web
```

Or edit `apps/web/package.json` manually:

```json
{
  "dependencies": {
    "@org/types": "*"
  }
}
```

Then run `npm install` again at the root.

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

- **Stack:** Next.js 16, React, Tailwind, TypeScript
- **Env:** `apps/web/.env.local`
- **Dev / build:** `npm run dev:web`, `npm run build:web`

### `apps/api` — `@org/api`

- **Stack:** Node, Express, TypeScript, esbuild
- **Env:** `apps/api/.env` (`HOST`, `PORT` default to `localhost` / `3333`)
- **Dev / build:** `npm run dev:api`, `npm run build:api`

### Python agents

| Project | Port | `requirements.txt` |
|---------|------|------------------|
| `ai-orchestrator` | 8001 | `apps/ai-orchestrator/requirements.txt` |
| `job-agent` | 8002 | `apps/job-agent/requirements.txt` |
| `apply-agent` | 8003 | `apps/apply-agent/requirements.txt` |
| `outreach-agent` | 8004 | `apps/outreach-agent/requirements.txt` |

- **Entry:** `main.py` (FastAPI `app`)
- **Env:** `apps/<agent>/.env`
- **Dev:** `npm run dev:<agent-name>`

---

## Common tasks

| Task | Command |
|------|---------|
| Install Node deps | `npm install` |
| List Nx projects | `npx nx show projects` |
| Lint | `npx nx run-many -t lint` |
| Format | `npx nx format:write` |
| Create Python venv | `python3 -m venv .venv` |
| Activate venv | `source .venv/bin/activate` |
| Install app Python deps | `cd apps/<app> && pip install -r requirements.txt` |

---

## Troubleshooting

**`npm run dev:*` fails for Python — `.venv` missing**

```bash
python3 -m venv .venv
cd apps/<your-app> && pip install -r requirements.txt
```

**Port already in use**

Change `PORT` in that app’s `.env`, or stop the other process using the port.

**Cannot resolve `@org/types`**

Run `npm install` from the repo root after adding the dependency to the app’s `package.json`.

**Nx cache issues**

```bash
npx nx reset
```

---

## License

MIT
