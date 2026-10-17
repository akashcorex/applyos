# Phase 5 — Close the Candidate Loop

## Status

Planned · Depends on Phase 4 (score contract, stage ledger, notifications) · References:
`career-ops-main/`, `ai-job-search-master/`.

## Goal

Take the user from a selected job to a submitted application with the loop actually closed:
**still-live job → evaluated job → tailored CV + cover letter → verified artifacts → submit (HITL) →
follow-up drafted when due.**

Phase 3 already submits. Phase 5 makes what happens around submission trustworthy and complete.

## Work items

### 5.1 — Evaluation report per job

**Problem.** Discovery returns an opaque score. Nothing shows _why_ a job matched, which requirements
are unmet, or whether the posting is even legitimate. There is no gate for future automation policy.

**What to implement.**

- Evaluation produced for each selected job before tailoring:
  - **Hard stops**: seniority band, location/work mode, language gate, work authorization (if set) —
    each quoting the JD or failing silently-with-reason.
  - **Requirement table**: JD requirement ↔ profile evidence ↔ `met | partial | missing`, with
    **importance** assigned from the JD before profile evidence is read (anti-anchoring), and evidence
    tiers (`stated | structural | inferred`) where `inferred` can never be critical.
  - **Strengths / gaps / risks** with reasons.
  - **Legitimacy screen**: freshness (posted date), repost history (from job first/last seen +
    snapshots), description-quality signals, agency/aggregator markers.
  - **Keyword extraction** — feeds 5.3's coverage report.
- Stored machine-readable (JSON) on the selection item / a `job_evaluations` row; rendered in the
  dashboard before tailoring.
- Cost-bounded: one LLM pass per job, reuse of unchanged job facts (24h cache semantics), no nested
  research agents.

**Where.** New service in `apps/job-agent` (parsers/liveness already live there) or orchestrator;
storage via Prisma; web discovery/auto-apply panel.

**Reference.** `career-ops-main/modes/oferta.md` (Blocks A–H, Importance×evidence gates, two-pass
rule, bounded research), `career-ops-main/batch/batch-prompt.md` (report schema), `career-ops-main/evaluation-cache.mjs`
(reuse rules), `ai-job-search-master/.claude/skills/job-application-assistant/04-job-evaluation.md`
(eligibility + language gates), `ai-job-search-master/.claude/commands/rank.md` (per-job JSON).

**Acceptance.** Every selected job has a report before tailoring; a failed hard stop cannot silently
proceed to auto-apply; every gap carries an evidence tier; `not_evaluated` is explicit, never blank.

**Boundary.** Does not change the MVP matching formula (Decision 4) — the report is a decision aid and
policy input, not a re-ranker.

### 5.2 — Cover letters

**Problem.** No cover letter exists anywhere in the product (apply-agent only fills ATS fields).

**What to implement.**

- Generation in `apps/resume-agent`, constrained by the same policy as variants: IR evidence only,
  no new facts, numbers/dates immutable.
- Stored + versioned like `ResumeVariant`; compiled through the existing compile queue as a second
  artifact kind (`cover_letter`), own LaTeX template.
- Approve/reject in the variant UI; apply-agent attaches it where a form requests one (Workable,
  Greenhouse, Wellfound note field).

**Where.** `apps/resume-agent` (prompt + template + artifact kind), `apps/api` routes,
web variant UI, `apps/apply-agent/app/ats/*` (fields already detected).

**Reference.** `career-ops-main/modes/cover.md` + `generate-cover-letter.mjs` (keyword confirmation,
draft-in-chat approval); `ai-job-search-master/.claude/commands/apply.md` step 2 +
`06-cover-letter-templates.md` (language matches posting, requirement coverage rule).

**Acceptance.** One cover letter per application in the same approved state as the CV; policy tests
prove no new facts and no changed numbers; never generated and sent unseen.

### 5.3 — Compile & parse verification

**Problem.** Compiles are trusted blindly: no page-budget enforcement, no layout checks, no ATS
text-layer verification, no keyword coverage diagnostic.

**What to implement.** Post-compile verification, stored as `verification` JSON on `ResumeArtifact`:

- **Page budget**: resume ≤ 2 pages, cover letter = 1 (hard fail on overflow, visible reason).
- **Layout** (port thresholds from the reference): mid-page holes > ~100pt, non-final pages ending
  early, stranded headings/orphaned entry titles, footer collisions.
- **ATS text layer**: contact details present as literal text, no `(cid:)`/replacement glyphs,
  ASCII-safe date ranges, reading order sane.
- **Keyword coverage** vs 5.1's extracted JD keywords: `present | synonym-only | missing (have it) |
missing (gap)` — **report only, never inject**.

**Where.** `apps/resume-agent/services/compiler.py`, `compile_worker.py`, `compile_jobs.py`,
artifact model, web variant preview.

**Reference.** `ai-job-search-master/tools/verify_pdf.py` (`--pages`, `--ascii-dates`, raw text
layer) + `tools/verify_layout.py` (geometry thresholds, exit-2 = skipped never a verdict) +
`apply.md` step 5d (coverage table + honesty rule); `career-ops-main/verify-ats.mjs`,
`keyword-match.mjs`, `verify-cv-structure.mjs`, `verify-cv-facts.mjs`, `cv-title-check.mjs`.

**Acceptance.** A compiled artifact returns `{pages, layout_issues[], ats_issues[], keyword_coverage[]}`;
over-budget or garbled-date artifacts fail closed with a named reason; a resume whose title drifted
from the profile is flagged, not silently accepted.

### 5.4 — Follow-up cadence + drafts

**Problem.** Nothing happens after `submitted`; the landing page already claims follow-ups that do not
exist.

**What to implement.**

- Cadence calculator: Applied 7d, Responded/Assessment 3d, Interview 1d; urgency buckets; **max 2 per
  application**; stop on any reply; never for `draft`.
- Due-queue job → draft via `apps/outreach-agent/services/message_generator.py` using **only claims
  from materials already submitted** (the archived CV/cover letter + posting); channel-shaped
  (email vs LinkedIn).
- Surfaced via Phase 4 notifications; each attempt appended to the stage ledger / application events;
  never sends.

**Where.** scheduler (orchestrator or API worker), outreach-agent generator, stage ledger as signal,
notifications.

**Reference.** `career-ops-main/followup-cadence.mjs` + `followup-seed.mjs` + `modes/followup.md`
(URGENT/OVERDUE/waiting/COLD, max-2-then-cold, agency-aware targeting);
`ai-job-search-master/.claude/commands/outcome.md` (10-day default, 60–120 words, one value reminder,
no new claims, logged via dated note).

**Acceptance.** Cadence unit tests; drafts exist for due applications; nothing auto-sends; max-2 rule
enforced; marketing copy matches reality.

### 5.5 — Liveness + aggregator confirmation

**Problem.** The hourly reconciler closes listings that left a board, but there is no per-URL liveness
check, no expired write-back that stops resurfacing, and no aggregator confirmation rule — Wellfound
listings are treated as authoritative although aggregators keep stale reqs live long after closure.

**What to implement.**

- `check_liveness(url)`: API-first for supported ATS (Greenhouse, Lever, Ashby, Workable, Personio,
  Recruitee; more in Phase 7.1), Playwright fallback for the rest.
- Verdicts `active | expired | uncertain`: an explicit closure/404 is `expired`; an unreadable page,
  loading placeholder, or login wall is `uncertain` — never closed, never penalized.
- `expired` closes the `Job` (`isActive=false`, `closedAt`), is recorded so the posting cannot
  resurface as new, and ejects it from selections.
- Aggregator rule: aggregator-sourced listings are marked `unconfirmed` and cannot reach tailoring or
  apply until found on the employer's ATS; the employer URL becomes canonical; not found → stale +
  `Discarded` with a note.

**Where.** `apps/job-agent` (liveness service + route), `apps/api/src/lib/job-reconcile.ts`, discovery
and selection pipeline.

**Reference.** `career-ops-main/check-liveness.mjs`, `liveness-api.mjs`, `liveness-core.mjs`
(expired recorded back into dedup history; `uncertain` never recorded), `AGENTS.md` aggregator rule +
LinkedIn loading guard; `ai-job-search-master/.agents/skills/linkedin-search/SKILL.md`
(`isActive: false` → expired, never presented).

**Acceptance.** Dead postings stop resurfacing; `uncertain` produces no state change; an
aggregator-only listing cannot be tailored/applied; employer URL replaces the aggregator URL when
confirmed.

## Schema changes (planned)

| Change                                                                                    | Item     |
| ----------------------------------------------------------------------------------------- | -------- |
| `job_evaluations` table (or JSON on `job_selection_items`)                                | 5.1      |
| `ResumeArtifact.kind` extended (`cover_letter`), `verification` JSON column               | 5.2, 5.3 |
| `Job`: `livenessStatus`, `lastLivenessAt`, `canonicalUrl`, `origin` (aggregator/employer) | 5.5      |

## Service/API changes (planned)

- job-agent: evaluation service + liveness service (new routes).
- resume-agent: cover-letter generation; compile verification step.
- orchestrator: follow-up scheduler; selection gates for liveness/confirmation.
- web: evaluation report panel, cover letter in variant UI, verification badges, follow-up queue.

## State machine changes

- Selection gains a gate: `selected → confirmed-live/confirmed-at-employer → tailoring`. No new
  workflow statuses.

## Explicit non-goals

Email sending, reply sync, interview prep, provider expansion beyond liveness needs, template picker.

## Definition of done

- [ ] Evaluation report for every selected job, with hard stops + evidence tiers + legitimacy screen
- [ ] Cover letter artifact generated, compiled, approved, attached by apply-agent where applicable
- [ ] Verification JSON on every compiled artifact; over-budget fails closed
- [ ] Follow-up drafts produced on cadence, max 2, surfaced via notifications, never sent
- [ ] Liveness verdicts + aggregator rule enforced in discovery and selection

## Verification

`bun test` + `python3 tests/run.py all` green; new unit suites per item; an end-to-end smoke: select a
job → report → CV + cover → verify → submit → follow-up draft appears when due. Extend
`scripts/phase3_smoke_test.py` rather than starting a new harness.

## Open risks / unresolved

- Evaluation cost per job (mitigate with the 24h fact cache and cheap pre-filters; measure tokens/job).
- Layout thresholds are calibrated for the reference's template geometry — re-calibrate for
  `applyos-ats` / `applyos-modern` before enforcing hard fails.
- Aggregator confirmation may drop Wellfound yields significantly; measure before enabling for all
  sources.
