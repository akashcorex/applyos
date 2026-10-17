# Phase 4 — Foundations (Standardization)

## Status

Planned · Depends on Phase 3 DONE (submit → ledger → HITL) · No new external services.

## Goal

Standardize the contracts every later phase depends on: one score output, a candidate-journey stage
model separate from automation status, a working notification pipeline, and the policy decisions that
constrain everything after.

This phase ships no user-visible feature. It exists because Phase 5–7 work items all consume these
four contracts; building them per-feature would fork them (the same mistake the two reference
frameworks avoided by fixing their data contracts early).

## Work items

### 4.1 — Unified score contract

**Problem.** Score compositions are scattered: job-agent semantic blend
(`services/semantic_match.py`), skill overlap (`services/skills.py`), orchestrator filter
(`services/filter.py`), behavior rerank (`apps/resume-agent/services/matching/rerank.py`).
A score number carries no
confidence, evidence, or explanation, and `apps/job-agent/todo.md` Track A already calls for one
contract.

**What to implement.**

- `ScoreResult` schema in `packages/validation`:
  `{ score (0–100), band (strong|good|moderate|weak|poor), components[], confidence (high|medium|low),
evidence_tier (stated|structural|inferred), reason, not_evaluated[] }`.
- Every scorer emits it; behavior boost becomes a named component, not a second formula.
- Persist in `match_sessions.top_results`; return from `savedJobResponse` and `GET /v1/jobs`;
  web feed sort toggle (score / recency).

**Where.** `apps/job-agent/services/semantic_match.py`, `apps/resume-agent/services/skills.py`,
`apps/ai-orchestrator/services/filter.py`, `apps/api/src/routes/jobs.ts`, `packages/validation/src`.

**Reference.** `career-ops-main/batch/batch-prompt.md` (`Machine Summary → score_evidence`,
`confidence_gaps`), `career-ops-main/modes/oferta.md` (evidence tiers stated/structural/inferred,
`inferred` capped out of hard stops). `ai-job-search-master/.claude/skills/job-application-assistant/04-job-evaluation.md`
(0–100 dimensions + bands).

**Acceptance.** One exported schema; drift test (mirror the existing enums drift test); every score
surface returns `ScoreResult`; a stored score can be explained later without re-running matching.

### 4.2 — Candidate-journey stage model

**Problem.** `Application.status` models the _automation_ (`queued/running/captcha_blocked/…`); the
candidate journey is a 4-value outcome enum (`viewed|rejected|interview|offer`) patched through
`PATCH .../applications/outcome`. A funnel cannot be computed, and draft-like states cannot be
excluded from it.

**What to implement.**

- `ApplicationStage` enum: `draft | applied | responded | assessment | interview | offer | hired |
rejected | no_response | withdrawn | discarded`.
- Append-only ledger: `application_stage_events(applicationId, from, to, source, note, createdAt)`.
- API: user-facing `PATCH stage` (web) + internal service write; keep the legacy outcome endpoint as a
  mapping layer for back-compat.
- Funnel queries read the ledger; `draft` excluded from every stat.

**Where.** `packages/database/prisma/schema.prisma`, `packages/database/src/enums.ts` +
`packages/validation` enums, `apps/api/src/routes/applications.ts`, `apps/api/src/routes/workflows.ts`
(outcome PATCH → stage mapping), `apps/web/src/components/WorkflowPanel.tsx`, applications panel.

**Reference.** `career-ops-main/templates/states.yml` (10 canonical states, terminal flags) +
`data/status-log.tsv` (`{tracker#}\t{date}\t{from}\t{to}\t{source}\t{note}`, closed source set);
`ai-job-search-master/.claude/commands/outcome.md` (status vocabulary; `drafted` is open but never
chased and excluded from every statistic).

**Acceptance.** Every application has a stage; every change appends exactly one ledger row; current
stage derivable from the ledger alone; legacy outcomes map 1:1 (`viewed→responded`, `rejected→rejected`,
`interview→interview`, `offer→offer`); unit tests prove drafts are excluded from funnel math.

### 4.3 — Notification pipeline

**Problem.** The `Notification` model exists and the dashboard bell is decorative; nothing is ever
written, so nothing can surface "needs your input", "submitted", or "follow-up due".

**What to implement.**

- Writers on key events: `waiting_for_human` (needs action), `submitted`, `compile_failed`,
  and placeholders consumed by Phase 5 (`follow_up_due`) and Phase 6 (`reply_detected`).
- Read API: `GET /v1/notifications` (+ unread count), `PATCH /:id/read`; bell dropdown + list.
- Dedupe key per `(userId, type, refId)` so a retried event cannot double-notify.

**Where.** New notification service in `apps/api/src/lib/`, `apps/ai-orchestrator/services/results_consumer.py`
(apply outcomes), `apps/web` header/dashboard.

**Reference.** `career-ops-main/weekly-digest.mjs`, `ai-job-search-master/.claude/commands/outcome.md`
(surface-what-needs-attention loop).

**Acceptance.** No notification is produced for draft-only state; all event types covered by API
tests; dedupe verified by replaying the same event twice.

### 4.4 — Policy decisions (ADR)

**What to implement.** Write short ADRs in `docs/decisions/` (one file per decision, NNNN-title.md):

1. **`autoSubmit` policy.** Recommendation: hard human gate by default; opt-in autonomy only after an
   explicit consent step and never through the first applications. Both reference frameworks treat
   "never auto-submit" as an ethical hard rule.
2. **Aggregator confirmation.** Aggregator-sourced listings (Wellfound, LinkedIn, …) are _unconfirmed_
   until the same role is found on the employer's ATS; employer URL becomes canonical; not found →
   stale + `Discarded`. Enforced in discovery (Phase 5.5).
3. **Outbound email stays draft-only** until Phase 7.2 ships with per-send approval.
4. **JD archival.** Every application keeps the posting's verbatim text (primary mechanism: a
   `Job.descriptionRaw` snapshot at selection time; captured once, never re-fetched).
   `career-ops-main/check-jd-archive.mjs` validates this invariant in the reference; Phase 6.4
   interview prep depends on it.

**Acceptance.** Each decision names its enforcement point (file/gate) and the phase that implements it.

## Schema changes (planned)

| Change                                                                                       | Item     |
| -------------------------------------------------------------------------------------------- | -------- |
| `ApplicationStage` enum + `application_stage_events` table (+ migration)                     | 4.2      |
| No new tables for score or notifications (JSON in `match_sessions`; existing `Notification`) | 4.1, 4.3 |

## Service/API changes (planned)

- job-agent/en orchestrator/resume-agent: emit `ScoreResult` from every scoring path (4.1).
- API: `PATCH stage`, stage events read, outcome PATCH mapped (4.2); notifications read/write (4.3).
- Web: feed sort toggle (4.1), stage control (4.2), bell + list (4.3).

## State machine changes

- Introduces the candidate-journey ladder (`draft → applied → responded → assessment → interview →
offer → hired|rejected|no_response|withdrawn`), orthogonal to `Application.status`. No changes to
  the automation state machine or `WorkflowRun` statuses.

## Explicit non-goals

UI redesign, new LLM evaluation, email sending, provider expansion, any user-visible Phase 5 feature.

## Definition of done

- [x] `ScoreResult` exported and consumed by all scorers; drift test green — verified 2026-10-18:
      `packages/validation/src/score.test.ts` + `tests/test_resume_agent_score_contract.py` (TS↔Python parity via
      `contracts.snapshot.json`), plus job-agent semantic, resume-agent matcher/rerank, orchestrator filter, and
      `tests/test_phase2_http.test.ts` API surfaces; snapshot regenerated with `bun --filter @applyso/validation snapshot-json-schema`.
- [ ] Stage ledger written on every stage change; funnel excludes drafts (tested)
- [ ] Notifications written/read/deduped for the Phase 4 event types
- [ ] Four ADRs recorded with named enforcement points

## Verification

Unit tests for the schema/serializers and stage ledger; migration applied in CI DB job; replay test
for notification dedupe; existing suites (`bun test`, `python3 tests/run.py all`) stay green.

## Open risks / unresolved

- Score adoption touches three services at once — land it behind the drift test, not a big-bang PR.
- Outcome→stage mapping must stay lossless for rows created before the migration.
- ADR-1 (`autoSubmit`) changes user expectations; needs product copy, not just code.
