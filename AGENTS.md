# AGENTS.md

Turborepo + Bun monorepo. JS/TS via Bun, Python agents via `uv`. Prisma is the only ORM (`packages/database`).

## Services and ports

- `apps/web` (Next.js, 3000) · `apps/api` (Express, 5000) · `apps/ai-orchestrator` (8001) · `apps/job-agent` (8002) · `apps/apply-agent` (8003, module is `app.main`) · `apps/outreach-agent` (8004) · `apps/resume-agent` (8005)
- Shared: `@applyso/{database,validation,analytics,types,ui,logger}` in `packages/*`, imported as `@applyso/<name>`.

## Commands (run from repo root)

- Install: `bun install`. CI uses `bun install --frozen-lockfile` with `bun-version: latest` (lockfile is newer than the pinned `packageManager`).
- Dev: `bun run dev:web`, `bun run dev:api` (note: API task is `serve`, not `dev`), `bun run dev:<agent>` (e.g. `dev:job-agent`), or `bun run dev:agents` for all agents. Single package: `bunx turbo run <task> --filter=<pkg>`.
- DB first: `bun run db:generate` before `typecheck`, `bun test`, or any build (Prisma client is gitignored). `bun run db:migrate` before starting services. `build:web`/`build:api` default `DATABASE_URL` to `postgresql://postgres:postgres@127.0.0.1:5432/outreach`.
- Verify: `bun run lint`, `bun run format:check` (fix: `bun run format`), `bun run typecheck`, `bun test` (JS), `uvx ruff@0.16.5 check apps tests scripts` (Python baseline `E4,E7,E9,F` in `ruff.toml` — keep pinned version).
- Python tests: `python3 tests/run.py all | <app> | <file>` (e.g. `python3 tests/run.py job-agent`). Runner does `uv sync --extra dev` and sets `PYTHONPATH` per app; suites are hermetic (fakes/mocks, no Postgres/Redis). `apply-agent` has no `pyproject`/`uv.lock` and is NOT in `tests/run.py` or the CI matrix — don't add it without packaging it first.

## Gotchas

- `turbo serve` depends on `^build` + `sync`; agent `serve` scripts run `uvicorn` with `--reload`.
- `@applyso/validation` (Zod 4.5 contracts, single source of truth) is consumed as raw TS with NodeNext `.js` relative imports that Turbopack can't resolve — CI builds only `@applyso/api` + `@applyso/validation`, never `next build`. Typecheck covers web instead. Don't "fix" CI by adding `build:web` back.
- Env is per-app: `apps/web/.env.local`, `apps/api/.env`, `apps/<agent>/.env`. Same high-entropy `AGENT_SERVICE_TOKEN` in web/api/orchestrator/resume/apply; never expose via `NEXT_PUBLIC_`. API needs `RESUME_AGENT_URL` (default `http://127.0.0.1:8005`).
- ESLint is `strict` + `stylistic` without type-checked rules; `@applyso/**` and `@/**` sort as internal-first in `import/order`. `no-console` allows only `warn`/`error`. Tests/scripts relax `no-explicit-any`, `no-console`, `import/no-cycle`.
- Comments stay one line max (`.cursor/rules/comments.mdc`); prefer none when the name explains it.
- `apps/web/AGENTS.md` is the auto-generated Next.js 16 block: read `node_modules/next/dist/docs/` before writing Next.js code, and don't delete the block.
