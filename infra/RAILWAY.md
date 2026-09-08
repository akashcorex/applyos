# Railway Deployment — applyos.in

All Railway artefacts live in `infra/` (Dockerfiles + `infra/railway/*.json`).

```
infra/
├── Dockerfile.web                # Next.js (Bun + Turborepo)
├── Dockerfile.api                # Express API (Bun + esbuild) -> apps/api/dist/main.js:16
├── Dockerfile.ai-orchestrator    # FastAPI Python 3.12 (uv)
├── Dockerfile.job-agent
├── Dockerfile.apply-agent        # Playwright + Chromium
├── Dockerfile.resume-agent
├── Dockerfile.outreach-agent
├── docker-compose.yml            # local pgvector + redis
└── railway/
    ├── web.json                  # builder: dockerfile, dockerfilePath: infra/Dockerfile.web
    ├── api.json
    ├── ai-orchestrator.json
    ├── job-agent.json
    ├── apply-agent.json
    ├── resume-agent.json
    ├── outreach-agent.json
    └── env.example               # copy to Railway Variables
```

## 1. What was fixed for Railway

- `apps/api/src/main.ts:16` `HOST` default `localhost` → `0.0.0.0`
- `apps/*/config.py:5` / `apps/apply-agent/app/config.py:15` `host` `127.0.0.1` → `0.0.0.0`
- `apps/ai-orchestrator/config.py:5` added `host`/`port` (was missing)
- `apps/*/package.json:7` `serve` now `sh -c '... --host 0.0.0.0 --port ${PORT:-800x}'` (Railway injects `$PORT`)
- `apps/web/package.json:8` `start` → `next start -H 0.0.0.0 -p ${PORT:-3000}`
- `apps/web/next.config.js:9` supports `NEXT_STANDALONE=true` → `output: 'standalone'` for Docker

## 2. Create Railway Project

1. https://railway.app → **New Project** → **Deploy from GitHub repo** → `applyos.in`
2. **+ New → Database → PostgreSQL** (use `pgvector/pgvector:pg17` if you need `vector` extension for `resume-agent`) and **Redis**
3. Note `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`, `REDIS_URL` = `${{Redis.REDIS_URL}}`

## 3. Create 7 Services (same GitHub repo, different Dockerfile)

For each service: **+ New → GitHub Repo** → select `applyos.in` → **Settings** →

| Service                | Root Directory                                                                  | Dockerfile Path                    | Config as Code                      | Healthcheck |
| ---------------------- | ------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- | ----------- |
| `web`                  | Prefer **Vercel** (`applyos-ai`). Keep this Railway service only as a fallback. | `infra/Dockerfile.web`             | `apps/web/railway.json`             | `/`         |
| `api` / `@applyso/api` | _empty_ (`/`)                                                                   | `infra/Dockerfile.api`             | `apps/api/railway.json`             | `/`         |
| `ai-orchestrator`      | _empty_ (`/`)                                                                   | `infra/Dockerfile.ai-orchestrator` | `apps/ai-orchestrator/railway.json` | `/health`   |
| `job-agent`            | _empty_ (`/`)                                                                   | `infra/Dockerfile.job-agent`       | `apps/job-agent/railway.json`       | `/health`   |
| `apply-agent`          | _empty_ (`/`)                                                                   | `infra/Dockerfile.apply-agent`     | `apps/apply-agent/railway.json`     | `/health`   |
| `resume-agent`         | _empty_ (`/`)                                                                   | `infra/Dockerfile.resume-agent`    | `apps/resume-agent/railway.json`    | `/health`   |
| `outreach-agent`       | _empty_ (`/`)                                                                   | `infra/Dockerfile.outreach-agent`  | `apps/outreach-agent/railway.json`  | `/health`   |

> **Why Root Directory = `/`** for all? The repo is a Bun Turborepo. Node services need `packages/*` and `bun.lock` at root. Python Dockerfiles in `infra/` use `COPY apps/<name>/...` so they also need root context. Do **not** set Root to `apps/web`.

Each app also has `apps/<service>/railway.json` (builder `DOCKERFILE`). Railway’s bun monorepo importer reads that file from the package directory — do not rely only on `infra/railway/*.json`.

Leave **Root Directory empty** (`/`) on every service. The Dockerfiles copy from the repo root (`packages/*`, `bun.lock`). If Root is `apps/api`, the image build fails in a few seconds with “Failed to build an image”.

Alternatively import `infra/railway/<service>.json` as template in **Settings → Config as Code**.

Watch paths are scoped so a change in `apps/web` does **not** rebuild Railway agents. Each service only watches its own folder (API also watches `packages/database` and `packages/validation`). Confirm **Settings → Source → Config as Code** is `apps/<service>/railway.json` and Watch Paths is not empty. Patterns are repo-root anchored (`/apps/api/**`).

Set **Networking → Generate Domain** for `web` and `api` only. Keep agents private (`*.railway.internal`) for cheaper/faster internal calls.

## 4. Env Vars

Copy `infra/railway/env.example` to each service's **Variables** tab.

Critical shared var (must be identical):

```
AGENT_SERVICE_TOKEN=openssl rand -hex 32
```

Per-service overrides for private networking:

- `ai-orchestrator`:
  ```
  JOB_AGENT_URL=http://job-agent.railway.internal:8002
  APPLY_AGENT_URL=http://apply-agent.railway.internal:8003
  RESUME_AGENT_URL=http://resume-agent.railway.internal:8005
  API_URL=http://api.railway.internal:3333
  REDIS_URL=${{Redis.REDIS_URL}}
  ```
- `apply-agent`: `API_URL=http://api.railway.internal:3333`, `RESUME_AGENT_URL=http://resume-agent.railway.internal:8005`, `REDIS_URL`
- `resume-agent`: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `JOB_AGENT_URL=http://job-agent.railway.internal:8002`
- Vercel `web`: `API_URL=https://api.applyos.in`, `NEXT_PUBLIC_API_URL=https://api.applyos.in`, `NEXT_PUBLIC_WEB_URL=https://www.applyos.in`
- `api`: `HOST=0.0.0.0`, `WEB_URL=https://www.applyos.in`, `BETTER_AUTH_URL=https://api.applyos.in` (custom API domain, not `*.up.railway.app`), `DATABASE_URL`
- Google / LinkedIn authorized redirect: `https://api.applyos.in/api/auth/callback/google` and `.../linkedin`

## 5. DB Migration

The API image runs `prisma migrate deploy` on every start (`apps/api/scripts/start.sh`) before `node apps/api/dist/main.js`. Railway injects `DATABASE_URL` at deploy time — do not set it in the Dockerfile.

Manual fallback (local or one-off):

```bash
DATABASE_URL=<railway-postgres-url> bun run db:migrate
# or
railway run --service api bun run db:migrate
```

## 6. Deploy

- Push to `main` → auto-deploy (if **Settings → Source → Auto Deploy** on)
- Manual: `railway up --service web` etc. (requires `railway link`)

CLI:

```bash
npm i -g @railway/cli
railway login
railway link # select project
railway up --service api
railway logs --service api
```

## 7. Local Docker test (optional)

```bash
docker build -f infra/Dockerfile.web -t applyos-web .
docker run -p 3000:3000 -e PORT=3000 applyos-web

docker build -f infra/Dockerfile.api -t applyos-api .
docker run -p 3333:3333 -e PORT=3333 -e HOST=0.0.0.0 -e DATABASE_URL="$DATABASE_URL" applyos-api

docker build -f infra/Dockerfile.ai-orchestrator -t ai-orchestrator .
```

## 8. Alternative: Nixpacks (no Docker)

If you prefer Nixpacks, set **Builder = Nixpacks** and use:

- Build Command: `bun install && bun run build:web` (web) / `bun install && bun run build:api` (api) / `uv sync --frozen` (python)
- Start Command: `bun --filter @applyso/web start` / `node apps/api/dist/main.js` / `uv run uvicorn main:app --host 0.0.0.0 --port $PORT`

Templates in `infra/railway/*.json` and `apps/*/railway.json` use `"builder": "DOCKERFILE"` (Railway’s schema rejects lowercase `dockerfile`). Switch to `"RAILPACK"` only if you drop the Dockerfiles.

## 9. “Failed to build an image” in ~7s

That message with almost no build logs means Railway never found a usable Dockerfile (or rejected the builder name). It is not a Python/Bun dependency error.

Check each service **Settings**:

1. **Root Directory** is empty (not `apps/<name>`).
2. **Builder** is Dockerfile, path `infra/Dockerfile.<service>`.
3. Config as Code is `apps/<service>/railway.json` (or unset so the file in the package dir is picked up).
4. If **Use Metal Build Environment** is on and logs stop at “scheduling build”, turn it off and redeploy.
