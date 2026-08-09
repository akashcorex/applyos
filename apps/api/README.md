# api

`api` is the Express backend server (port 3333). It handles authentication, serves as the gateway between the frontend and the database, and will coordinate with the AI agent microservices.

**Status: early stage** — auth is fully wired. Agent coordination endpoints are pending implementation.

## What it does

- **Authentication** — email/password and LinkedIn OAuth via better-auth with Drizzle/PostgreSQL adapter
- **Database gateway** — connects to PostgreSQL (Neon) via `@applyso/database` shared package
- **Health check** — `GET /` returns service status
- **Future** — API routes for job management, workflow orchestration, and agent coordination

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `ALL` | `/api/auth/*` | better-auth universal handler (sign-in, sign-up, session, sign-out, OAuth callbacks) |
| `GET` | `/` | Health check |

better-auth handles these sub-routes automatically:
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-up/email`
- `GET /api/auth/session`
- `POST /api/auth/sign-out`
- `GET /api/auth/callback/linkedin`
- `GET /api/auth/linkedin/authorize`

## Tech stack

- **Express 4** + TypeScript, built with esbuild
- **better-auth** for authentication
- **Drizzle ORM** + PostgreSQL (Neon cloud, local via Docker)
- **CORS** configured for frontend at `http://localhost:3000`

## Shared packages

- `@applyso/database` — Drizzle schema (user, session, account, verification) and DB client
- `@applyso/types`, `@applyso/sdk`, `@applyso/ui`, `@applyso/logger`, `@applyso/queue` — available for future use

## Run locally

From the repository root:

```bash
bun run dev:api
```

The API will be available at `http://localhost:3333`.

## Local config

The app reads environment values from `apps/api/.env`.

Key settings:
- `DATABASE_URL` — PostgreSQL connection string
- `AUTH_SECRET` — better-auth secret key
- `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` — LinkedIn OAuth credentials
- `WEB_URL` — frontend origin for CORS (default `http://localhost:3000`)
- `BEACON_API_KEY` — (optional) Fallow runtime coverage beacon

See `.env.example` for the full list.
