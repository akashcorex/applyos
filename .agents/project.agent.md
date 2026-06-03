# Outreach Project Agent Context

## Project Intention

Build an outreach automation platform that helps coordinate job discovery, application workflows, and outbound outreach from a single monorepo.

The codebase is intentionally split by responsibility:

- `apps/web` is the user-facing Next.js app.
- `apps/api` is the TypeScript Express API, intended to run in the Bun-based JavaScript stack.
- `apps/ai-orchestrator`, `apps/job-agent`, `apps/apply-agent`, and `apps/outreach-agent` are Python FastAPI services for agentic workflows.
- `packages/*` are shared TypeScript libraries that should be consumed through `@org/*` workspace imports.

## Runtime Plan

- Use Bun as the primary JavaScript runtime, package installer, and script runner for the overall workspace.
- Use Nx as the monorepo task runner through Bun, for example `bun nx show projects`, `bun nx run-many -t lint`, and `bun run dev:web`.
- Keep Python agents on Python 3.12 with the shared root `.venv`, while preserving per-agent `requirements.txt` files.
- Keep environment variables per app; do not create a single root `.env` for all services.

## Agent Working Rules

- Prefer existing Nx project boundaries and package names over ad hoc imports.
- Run workspace tasks through Nx when possible.
- Keep TypeScript shared code in `packages/*` and import it as `@org/<package>`.
- Do not make Python agents import npm packages directly; connect them through HTTP APIs or future Python-specific shared modules.
- Update `README.md` when setup, runtime, or app commands change.

## Current Priorities

- Stabilize the monorepo foundation around Bun, Nx, Next.js, Express, and FastAPI services.
- Flesh out shared packages only when an app has a concrete need for them.
- Keep agent services independently deployable, with clear ports, env files, and dependency files.
