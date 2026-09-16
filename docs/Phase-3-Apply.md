# Phase 3 — Tailor → Apply → Track

## Goal

At the end of Phase 3 the user can turn selected jobs into approved tailored resumes, submit applications through the browser agent, resolve blockers via human control, and spend exactly one credit per successful submission with a full audit trail.

## Depends on

Phase 1 (confirmed Profile) + Phase 2 (persisted `jobs` + owned `JobSelection`) DONE. The web handoff uses `selectionId` to load canonical jobs before tailoring/apply. Consumes: `ResumeVariant(draft)` input contract and `POST /v1/workflows/internal/start` durable creation. Produces submitted applications + usage increments.

## Schema changes

Per `MVP-Scope.md` disposition matrix: no new tables in this phase.

- Reuse `resume_variants, resume_tailoring_patches, resume_compile_jobs (source_mode=structured only), resume_artifacts, variant_versions`.
- Reuse `workflow_runs, workflow_jobs (with jobId FK), applications, application_events, human_interventions, agent_tasks, workflow_events, usage_cycles`.
- Reuse `match_sessions` (read) + `match_interactions` (write `apply` event on submit; `impression|click|skip` were Phase 2).
- `notifications` table exists but stays unwritten (sender is post-MVP).

## Service/API changes

- Resume-agent: `POST /resume/{id}/variants` (create `draft`), tailoring patch (`approved`), `preview/finalize` enqueue compile (`kind=preview|finalize`, single template), `GET /compile-jobs/{id}` poll, `GET .../pdf` artifact. No tex-editor or multi-template endpoints in MVP.
- API: `POST /v1/workflows/internal/start {userId, resumeId, request, applications[]}` accepts 1–10 application records, including optional canonical `jobId`, with idempotency `userId:dedupKey:variant` and quota `402` on exceed; `POST .../:id/status` transitions + `PATCH .../applications/outcome`; existing `POST /v1/applications/internal/:id/resume|take-control|release-control|stop` + intervention/event endpoints unchanged.
- Orchestrator → apply-agent dispatch unchanged (Celery + Redis Streams results consumer).
- Web: discovery opens `/dashboard/auto-apply?selectionId=...`; auto-apply loads the owned canonical selection, requires a resume, supports optional tailoring, then queues applications through the durable workflow.

## State machine changes

- Tailoring (Decision 5): `variant(draft) → patch(approved) → compile(queued→running→succeeded|failed, auto-retry ≤3) → artifact → user approved|rejected (rejected → new patch, stays draft)`.
- Application: `pending→queued→starting→running→waiting_for_human→resuming→submitted` plus `failed/captcha_blocked/already_applied/login_required/timed_out/skipped/cancelled` (per `enums.ts:44-60`, no new states). `waiting_for_human` entered on blocker or `autoSubmit=false` (`SUBMIT_APPROVAL`).
- Credits: increment `UsageCycle.submittedCount` only on first `submitted` transition (existing `workflows.ts:239-241`); gate counts `submitted + in-flight + requested` vs `included+bonus`.

## Explicit non-goals for this phase

Manual `.tex` editing, template picker, version-gallery restore UI, outreach email send, LinkedIn auto-connect, notification sender, company CRM UI, admin deep analytics. Single template only.

## Definition of done

- [x] Selecting 1–10 persisted jobs creates an owned durable selection and carries canonical `jobId` into the workflow handoff
- [ ] Selecting 1–10 persisted jobs creates one `draft` variant each with an `approved` patch
- [ ] Each variant compiles to a downloadable PDF artifact (or surfaces `failed` with `last_error` after retries)
- [ ] User can approve or reject a variant; rejected returns to `draft` with a new patch attempt
- [ ] Approved variants create `Application(pending)` rows linked to `workflow_jobs.jobId`
- [ ] Blocker/captcha/login pauses to `waiting_for_human` with an `open` intervention; user can take control, resolve, and resume to `submitted`
- [ ] Each first `submitted` increments `submittedCount` exactly once; quota-exceeded returns `402` before creation
- [ ] Every application has queryable `application_events` + outcome (`viewed|rejected|interview|offer`)

## Open risks / unresolved

- ATS layout drift breaking Playwright selectors (mitigated by `generic` handler + `HumanIntervention(UNEXPECTED_PAGE/AGENT_UNCERTAIN)` fallback).
- Long-tail blockers (OTP/bank-grade login) may force `cancelled` — acceptable MVP terminal state with `interventionReason` preserved.
