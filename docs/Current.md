# Current — What Exists Today (no changes, read-only truth)

## Core loop (already mostly built)
Resume → understand candidate → find jobs → tailor resume → apply → handle blockers → track result.

## Services
- `web :3000` — Next.js. Landing, login/signup, dashboard (overview, auto-apply, workflows, discovery, applications, linkedin, settings, admin). BFF in `src/app/api/*` proxies to API + orchestrator.
- `api :5000` — Express. Canonical auth/billing/durable workflow DB via Prisma. Mounts `/v1/me, profiles, resumes, workflows, applications, linkedin-connects, preferences, billing, admin`.
- `ai-orchestrator :8001` — Ephemeral state machine. Redis-only, no Postgres. Fans out to agents, consumes Redis Streams results.
- `resume-agent :8005` — Real. Parse → IR → patch → .tex → PDF. Own Postgres via `asyncpg`. Sync except `preview/finalize → 202 + poll`. Compile queue = Postgres `FOR UPDATE SKIP LOCKED`.
- `job-agent :8002` — Real, stateless. Scrapes greenhouse/lever/ashby/workable/recruitee/personio/wellfound → normalize → `dedup_key={namespace}::{title}::{location}` → semantic rank. Only SQLite `board_registry.db`.
- `apply-agent :8003` — Real Playwright stealth (no Selenium). Celery+Redis. LLM field-map. 8 ATS handlers. Reports via `POST /v1/applications/internal/:id/...`.
- `outreach-agent :8004` — Scaffold. Generate works, `POST /outreach/send → 501`. No DB, no callers.
- `packages/queue, packages/sdk` — Empty, zero imports.

## Key flows today
- Auth: Better Auth + Prisma (`User/Session/Account/Verification`). Google + LinkedIn if env set. `GET /v1/me` returns `hasResume, profileConfirmed, canApply, onboardingComplete`.
- Onboarding: `onboarding/page.tsx` just redirects to `/dashboard`. Gate is `requireHasResume` (canApply), not a wizard.
- Resume: `POST /v1/resumes/upload` → `ResumeFile + ResumeExtraction(PROCESSING)` → `POST resume-agent/internal/extract` → callback `complete/fail` → `Profile.upsert`. Storage = local filesystem both sides. No S3.
- Jobs: Not persisted until apply. `JobMatcher.match()` → `POST job-agent/search/semantic` → ranked list returned. `WorkflowJob` created only at apply-selection (`@@unique[workflowRunId, dedupKey]`).
- Apply: `POST /v1/workflows/internal/start` (1-10 jobs, idempotency `userId:dedupKey:variant`, quota check) creates `WorkflowRun + WorkflowJob(matched) + Application(pending) + AgentTask`. Orchestrator dispatches to apply-agent. Statuses: `pending → queued → starting → running → waiting_for_human → resuming → submitted`, plus `failed/captcha_blocked/already_applied/login_required/timed_out/skipped/cancelled`.
- HITL: Blocker or `autoSubmit=false` → `waiting_for_human/human_control` + `HumanIntervention(open)` + Redis wait 1800s. User resolves via `take-control / release-control / resume / stop` + live browser WS.
- Credits: Free 25, Starter 150, Pro 400, Power 1000 + addons. Increment **only on first transition to `submitted`** (`workflows.ts:239-241`). Gate includes in-flight. Correct rule already.

## Biggest issue
Split-brain resumes:
- API Prisma owns: `ResumeFile, ResumeExtraction, Profile`
- Resume-agent `asyncpg` owns: `Resume, ResumeVariant, SourceDocument, IrRevision, Patch, Artifact, LatexSource, CompileJob, VariantVersion`
- Two services can answer "what resume does user have?" differently. Must fix before MVP lock. See Phase 1.
