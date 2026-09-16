# Current — What Exists Today (no changes, read-only truth)

## Drift Report (derived fresh from code, not prior docs)
- Doc claim "33 tables" vs code: `packages/database/prisma/schema.prisma` has 34 `^model` blocks. Use 34.
- Doc claim "resume-agent owns its own Postgres / split-brain two DBs" vs code: single shared Postgres. `apps/resume-agent/dependencies.py:99-105` requires `public.resumes` to exist (Prisma-migrated) then `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE` mirrors 10 tables on the same DB. Real risk is dual migration paths (Prisma migrations vs agent DDL), not two databases.
- Doc claim "job-agent only board_registry.db" vs code: also `apps/job-agent/services/job_snapshots.py:13,38-62` SQLite `job_snapshots(dedup_key PK, first_seen_at, last_seen_at)` — per-instance, not shared. Relevant to Phase 2 first/last-seen design.
- Doc claim dedup = `{namespace}::{title}::{location}` vs code: correct (`services/dedup.py:31-36`), but code also has `listing_fingerprint(company|title|desc_hash)` (`:55-68`) for cross-company content dedup — docs omitted it.
- Endpoints named in docs vs code: no drift. `GET /v1/me` (`me.ts:14`), `POST /v1/resumes/upload` + `POST /internal/:id/complete|fail` (`resumes.ts:356,662,803`), `POST /v1/workflows/internal/start` (`workflows.ts:269`), `GET/PATCH/POST /v1/applications/internal/*` (`applications.ts:97,178,246,351,544,610,655,700`), `GET /v1/billing/me + POST /checkout|/portal` (`billing.ts:110,121,192`) all present.
- App lifecycle vs docs: no drift. `packages/database/src/enums.ts:44-60` matches documented `pending → queued → starting → running → waiting_for_human → resuming → submitted` + failures.
- Matching weights vs docs: code already locks `combine_match_score = round((0.7*semantic + 0.3*skills)*100,1)` (`services/skills.py:186`) + `seniority_allowed` hard gate (`matcher.py:98-99`). Not an open formula — Step 2 default is "keep".

## Core loop (already mostly built)
Resume → understand candidate → find jobs → tailor resume → apply → handle blockers → track result.

## Services
- `web :3000` — Next.js. Landing, login/signup, dashboard (overview, auto-apply, workflows, discovery, applications, linkedin, settings, admin). BFF in `src/app/api/*` proxies to API + orchestrator.
- `api :5000` — Express. Auth/billing/durable workflow via Prisma (34 models). Mounts `/v1/me, profiles, resumes, workflows, applications, linkedin-connects, preferences, billing, admin`.
- `ai-orchestrator :8001` — Ephemeral state machine. Redis-only, no Postgres. Fans out to agents, consumes Redis Streams results.
- `resume-agent :8005` — Real. Parse → IR → patch → .tex → PDF. Writes to shared Postgres via `asyncpg` (10 mirrored tables + ALTERs on `resumes/resume_variants/match_interactions`). Sync except `preview/finalize → 202 + poll`. Compile queue = Postgres `FOR UPDATE SKIP LOCKED`.
- `job-agent :8002` — Real, stateless. Scrapes greenhouse/lever/ashby/workable/recruitee/personio/wellfound → normalize → `dedup_key` + `listing_fingerprint` → semantic rank. SQLite `board_registry.db` + `job_snapshots` (local only).
- `apply-agent :8003` — Real Playwright stealth (no Selenium). Celery+Redis. LLM field-map. 8 ATS handlers. Reports via `POST /v1/applications/internal/:id/...`.
- `outreach-agent :8004` — Scaffold. Generate works, `POST /outreach/send → 501`. No DB, no callers.
- `packages/queue, packages/sdk` — Empty, zero imports.

## Key flows today
- Auth: Better Auth + Prisma (`User/Session/Account/Verification`). Google + LinkedIn if env set. `GET /v1/me` returns `hasResume, profileConfirmed, canApply, onboardingComplete`.
- Onboarding: `onboarding/page.tsx` just redirects to `/dashboard`. Gate is `requireHasResume` (canApply), not a wizard.
- Resume: `POST /v1/resumes/upload` → `ResumeFile + ResumeExtraction(PROCESSING)` → `POST resume-agent/internal/extract` → callback `complete/fail` → `Profile.upsert`. Storage = local filesystem both sides. No S3.
- Profile shape today: Prisma `Profile` has `fullName, headline, email, phone, location, professionalSummary, linkedin/github/portfolioUrl, skills[], education/experience/projects/certifications/achievements Json, isConfirmed` — no `preferredRoles/preferredLocations/workMode/seniority/totalExperienceYears` columns. `Resume` has `experienceYears, preferredRole, preferredLocations`. Phase 1 must bridge this (see MVP-Scope decisions).
- Jobs: Not persisted centrally until apply. `JobMatcher.match()` → `POST job-agent/search/semantic` → ranked list returned. `WorkflowJob` created only at apply-selection (`@@unique[workflowRunId, dedupKey]`).
- Apply: `POST /v1/workflows/internal/start` (1-10 jobs, idempotency `userId:dedupKey:variant`, quota check) creates `WorkflowRun + WorkflowJob(matched) + Application(pending) + AgentTask`. Orchestrator dispatches to apply-agent. Statuses per `enums.ts`.
- HITL: Blocker or `autoSubmit=false` → `waiting_for_human/human_control` + `HumanIntervention(open)` + Redis wait 1800s. User resolves via `take-control / release-control / resume / stop` + live browser WS.
- Credits: Free 25, Starter 150, Pro 400, Power 1000 + addons. Increment only on first transition to `submitted` (`workflows.ts:239-241`). Gate includes in-flight.

## Biggest issue (corrected)
Not two databases — one shared Postgres with two migration writers (Prisma migrations + agent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS`). Fix = make Prisma migrations the sole schema path; agent keeps read/write but stops DDL. See Phase 1.
