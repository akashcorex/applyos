# Phase 7 — Breadth & Polish

## Status

Planned · Depends on Phases 4–6 · References: `career-ops-main/` (v1.37.0),
`ai-job-search-master/` · Re-prioritize items from Phase 6.3 data once it exists.

## Goal

Widen the input surface (more boards, more sources), close the remaining outbound gap (email with
approval), and port the quality-of-life systems that make the loop sustainable: contacts, templates,
offer/upskill help, and hardened dedup.

## Work items

### 7.1 — Provider expansion

**Problem.** 10 ATS parsers + 7 feeds today vs ~110 zero-auth providers in the reference.

**What to implement.** Priority order by market coverage: Workday (discovery — currently apply-only),
SmartRecruiters, iCIMS, BambooHR, JazzHR, then reverse-ATS sweep mode over public board datasets
(checkpointed, resumable) and dead-board tracking.

**Where.** `apps/job-agent/services/parsers/*` (existing pattern: one module per ATS + fixtures).

**Reference.** `career-ops-main/providers/*.mjs` (detect/fetch contract), `scan-ats-full.mjs`
(reverse sweeps, checkpointing, `--resume`), `docs/SUPPORTED_JOB_BOARDS.md`.

**Acceptance.** Per-provider fixtures + offline tests (pattern already in `tests/fixtures/job-agent/`);
no provider ships without a registry entry and a dead-board escape hatch.

### 7.2 — Email sending + sequences (approved)

**Problem.** `POST /outreach/send` is 501; `email_sender.py` (Resend + SMTP) exists but is never
called. Follow-ups (5.4) and outreach drafts end at "copy this text".

**What to implement.** Wire sending behind **per-send explicit approval** + compliance: unsubscribe
handling, volume caps, domain-safe sending, send log; sequences only after single-send proves safe.
Draft-only default stays.

**Where.** `apps/outreach-agent/services/email_sender.py`, new approval API + UI (reuse Phase 4.3
notifications).

**Reference.** `career-ops-main/modes/email.md` (5 variants, draft-only, process-stuck incident style) —
the reference deliberately ships **no mail transport**; adoption here is a policy choice, so ADR first.

**Acceptance.** No send without an approval record; every send logged with provider id; unsubscribe
respected within one send.

### 7.3 — Contacts CRM + warm intros

**Problem.** No contacts, no "do I know anyone here?", no referral path.

**What to implement.** Contacts table (person, company, channel, source, last touch), contact lookup
before cold outreach, LinkedIn `Connections.csv` join against discovered/tracked companies, referral
link generation per matched job.

**Reference.** `career-ops-main/contacts.mjs` (vCard export, stable UIDs), `contact-lookup.mjs`
(exact-key company match before cold search), `linkedin-join.mjs` (offline join, read-only);
`ai-job-search-master/.claude/commands` scrape step 4.5 (two LinkedIn people-search links per high-fit
job — links only, never fetched).

**Acceptance.** Zero-network join; contacts are never a scoring input; deleting the CSV leaves no state.

### 7.4 — User template system

**Problem.** Two hardcoded LaTeX templates; users with their own CV template cannot use them.

**What to implement.** Register a user template (source extensions + compile command + fonts + page
limit) with a **mandatory test compile**; managed activation block that `/apply`/compile reads;
`--use default` reverts cleanly.

**Reference.** `ai-job-search-master/.claude/commands/add-template.md` + `templates/README.md`
(placeholder tokens, test compile, BEGIN/END ACTIVE-TEMPLATE block); `career-ops-main/cv-templates.mjs`
(template registry) + `modes/latex-tex.md` (in-place tailoring of a user's own .tex).

**Acceptance.** A user template that fails its test compile cannot be activated; reverting restores the
default with no residue.

### 7.5 — Offer prep + negotiation + upskill

**Problem.** No help once an offer arrives; no skill-gap map from the pipeline.

**What to implement.** Offer/contract clause walk (neutral descriptions, question list for a lawyer,
no verdicts, no legal advice), negotiation talking points tied to figures that appear verbatim in the
profile/CV (safety gate), skill-gap heatmap from tracked jobs' gaps with a learning plan.

**Reference.** `career-ops-main/modes/offer-prep.md`, `negotiation-roi.mjs` (same-number-verbatim gate),
`upskill.mjs` + `modes/upskill.md` (weighted gap map, provenance columns);
`ai-job-search-master` `/upskill` (recorded gaps beat inferred; Since-Last-Report diff) +
`salary_lookup.py`.

**Acceptance.** Negotiation numbers must trace to profile/CV; offer flows describe, never judge; gap
map excludes skills already present.

### 7.6 — Dedup URL algebra + ghost-job detection

**Problem.** Dedup is solid but not idiomatic-URL aware; agency re-posts with the employer stripped and
re-listed reqs currently slip through.

**What to implement.** URL canonicalization upgrades (tracking params, SPA `#/job/{id}` promotion,
aggregator posting-id extraction, language-param semantics), 90-day repost detection (2+ distinct URLs
on 2+ dates), cross-listing content fingerprint flag (warn-only).

**Reference.** `career-ops-main/url-key.mjs`, `detect-reposts.mjs`, `fingerprint-core.mjs`,
`merge-tracker.mjs` identity rules.

**Acceptance.** Two spellings of one SPA posting stay one row; two different ids stay two; repost flag
is warn-only and never hides a live posting.

## Schema changes (planned)

| Change                                                                     | Item |
| -------------------------------------------------------------------------- | ---- |
| `contacts` table + LinkedIn connect export ingestion                       | 7.3  |
| `user_templates` table (or storage layout) + activation pointer on profile | 7.4  |
| `offer_notes` / negotiation draft storage                                  | 7.5  |
| `jobs`: canonical URL columns + repost metadata                            | 7.6  |
| `outreach_sends` (log, provider ids, approval ref)                         | 7.2  |

## Service/API changes (planned)

- job-agent: new parsers + sweep mode (7.1).
- outreach-agent: send path behind approvals (7.2).
- API + web: contacts, templates, offer/upskill surfaces.

## State machine changes

- None beyond a possible `offer` sub-flow for 7.5 notes. Keep automation statuses untouched.

## Explicit non-goals

Localization/market-specific labor-law tables (revisit only if we expand markets).

## Definition of done

- [ ] ≥5 new providers with offline fixtures; reverse sweep is resumable
- [ ] Email send with approval record, send log, unsubscribe honored
- [ ] Contacts join runs offline; no contact data feeds scoring
- [ ] User template registered, test-compiled, and revertible
- [ ] Offer/negotiation/upskill surfaces shipped with their safety gates
- [ ] Dedup upgrades covered by identity unit tests (one-row/two-row cases)

## Verification

Per-provider fixtures + offline suite (`python3 tests/run.py job-agent`); send-path tests with a fake
provider; template activation round-trip; dedup unit tests for each URL class.

## Open risks / unresolved

- Sending email introduces deliverability + compliance liability — ADR-3 must be rewritten first.
- Sweep mode is expensive/flaky in the reference (checkpointing exists for a reason); budget before
  enabling.
- Offer-prep is legal-adjacent: keep "describes, never judges" and never research the specific
  contract online.
