# Phase 6 — Intelligence

## Status

Planned · Depends on Phase 4 (score contract, stage ledger, notifications) and Phase 5 (evaluation
reports, verified artifacts, JD archive) · References: `career-ops-main/`, `ai-job-search-master/`.

## Goal

Make the loop _learn_: critique before presenting, listen to the inbox, measure what actually works,
prepare for interviews from what was really submitted, and remember which companies are not worth
pursuing.

## Work items

### 6.1 — Reviewer pass (drafter → reviewer)

**Problem.** Tailored CV and cover letter get a single generation pass. Nothing adversarially checks
them before the user sees them.

**What to implement.**

- Optional second-pass reviewer with fresh context over the _drafts_ (passed inline, no re-reads) that
  returns structured findings:
  `{target, issue, reason_class: grounding|keyword|tone|structure, suggestion}`.
- One revision round applies findings; **grounding mismatches are always blocking** (a claim not
  traceable to IR/profile/cover letter sources is removed, never reworded).
- Findings + revision stored on the variant; visible as "what the reviewer changed".

**Where.** `apps/resume-agent/services/tailoring/*` (review step), orchestrator graph hook.

**Reference.** `ai-job-search-master/.claude/commands/apply.md` step 3 — typed edit protocol
(`{file, old_string, new_string, reason}`), reviewer reads only profile/eval/writing-style (not
templates), returns edits + narrative categories, verification runs once at the end.

**Acceptance.** Reviewer cannot introduce new facts (policy test); blocking findings are enforced;
reviewer off = today's behavior.

### 6.2 — Reply / status sync from email

**Problem.** Stages are updated by hand; company replies live in an inbox the product never reads.

**What to implement.**

- Read-only mailbox integration (Gmail API first) + a manual paste path (no-mailbox users).
- Classification: interview invite / assessment / rejection / offer / acknowledgment / noise.
- Match to applications (company + role + ATS sender domains `greenhouse.io, lever.co, workday,
ashbyhq.com, smartrecruiters.com, icims.com, bamboohr.com, …`), propose stage changes, apply **only
  after explicit batch approval**; every proposal cites the source email.
- Idempotent by message id; never infers `hired` / `offer_declined`; conflicting or unmatched signals
  surface for manual handling instead of guessing.

**Where.** New API service + worker, stage ledger (4.2), notifications (4.3), web approvals page.

**Reference.** `career-ops-main/reply-watch.mjs` + `reply-matcher.mjs` +
`docs/REPLY_PROPOSALS.md` + `paste-reply.mjs` (classify → match → propose → y/N batch);
`ai-job-search-master/.claude/commands/gmail-sync.md` (approval batch before any write, lookback
rules, subject-preserving notes, conflicting signals → manual).

**Acceptance.** No write without approval; re-run is a no-op; a rejection email can never move an
application to `offer`.

### 6.3 — Funnel analytics + calibration

**Problem.** Analytics events exist but there is no funnel, no score↔outcome truth, no per-ATS signal.

**What to implement.**

- Funnel computed from the stage ledger (Phase 4.2), drafts excluded everywhere.
- Per-ATS advance rate (which boards lead to responses/interviews), per-source quality (aggregator vs
  employer), response-time distribution.
- Score-vs-outcome calibration report once sample allows: does the Phase 4.1 score predict interviews?
  Advisory only — never edits scoring.
- Honesty conventions: denominators always shown, no comparative multipliers below n=20, small samples
  labeled, selection-bias notes.

**Where.** `packages/analytics`, new API report endpoints, dashboard analytics page.

**Reference.** `career-ops-main/modes/patterns.md` + `analyze-patterns.mjs` (decided vs conversion
denominators, `sufficientSample`, per-ATS vendor advance rate) + `funnel-velocity.mjs` (benchmark
ranges, censored medians with counts) + `calibrate.mjs` (verdicts separating/flat/inverted/insufficient);
`ai-job-search-master/.claude/commands/html-report.md` (stage-reached from merged history, drafted rows
excluded from every statistic).

**Acceptance.** Funnel math unit-tested; a report exists for any user with data; small samples are
never presented as trends.

### 6.4 — Interview prep + story bank

**Problem.** `interview` is an enum value; there is no prep surface, and the archive needed to prep
(posting + submitted artifacts) is only partly captured today.

**What to implement.**

- Per-application prep doc generated from that application's own archive: verbatim posting
  (Phase 4 ADR-4), the exact CV/cover letter submitted, and recorded feedback from earlier stages.
- Stage-aware question set (recruiter screen / hiring manager / peer / panel); likely questions derived
  from: recorded feedback → evaluation gaps (5.1) with honest bridge answers → posting requirements.
- STAR story bank with **provenance markers** (`source: cv | user-stated | derived-unverified |
user-cannot-confirm`); unverified numbers are labeled, never stated as fact; new facts discovered in
  prep are written back to the profile, not left in chat.
- Mock-interview mode (one question at a time, feedback per answer).

**Where.** New resume-agent/orchestrator surface + web page; storage next to the application.

**Reference.** `career-ops-main/modes/interview/plan|practice|debrief.md`, `interview-prep/*`,
`match-star.mjs`, `story-provenance-check.mjs` (four-bucket classification + confirmation invariant);
`ai-job-search-master/.claude/commands/interview.md` + `07-interview-prep.md` (verify-before-use
research, consistency brief: no claim in the room that is not on the paper).

**Acceptance.** Prep never contradicts submitted materials; unverified numbers labeled; a missing
posting archive blocks prep with a named reason instead of inventing context.

### 6.5 — Blacklist + company history

**Problem.** No do-not-apply list and no memory of how a company has treated the user.

**What to implement.**

- Blacklist model (company name/domain, reason, source) respected by discovery, selection, and apply.
- Per-company evidence card joining applications, stage ledger, replies, and liveness history:
  responsiveness, silent-after-interview flag, repeated reposts, blacklist state.
- Suggestion queue: silence past threshold (e.g. 30d post-interview) proposes a blacklist entry —
  suggestion only, never writes.

**Where.** Prisma model + gates in job-agent/API; card in web.

**Reference.** `career-ops-main/data/blacklist.md` + `company-history.mjs` +
`rejection-latency.mjs` (silence threshold + ready-to-copy suggestion, never writes).

**Acceptance.** Blacklisted companies cannot enter a workflow; card is read-only; suggestions require
explicit accept.

## Schema changes (planned)

| Change                                                                    | Item |
| ------------------------------------------------------------------------- | ---- |
| `blacklist_entries` table                                                 | 6.5  |
| Interview prep docs + story bank (tables or application-scoped artifacts) | 6.4  |
| Mailbox sync state (`mail_sync_state`, processed message ids)             | 6.2  |

## Service/API changes (planned)

- resume-agent: reviewer step; prep-doc generation.
- new mail sync worker + approvals API (6.2).
- analytics report endpoints (6.3).
- API gates: blacklist in discovery/selection/apply (6.5).

## State machine changes

- Reply sync may advance stages (`responded/assessment/interview/offer`) only through the Phase 4
  ledger with `source=mail_sync` and an approval record.

## Explicit non-goals

Sending email, LinkedIn DM automation, offer negotiation tools (Phase 7.5), auto-blacklisting,
auto-scoring changes.

## Definition of done

- [ ] Reviewer findings stored; grounding findings blocking; policy tests green
- [ ] Reply sync: approved batch updates a stage exactly once per email; manual path works without Gmail
- [ ] Funnel + per-ATS report from ledger with n-threshold honesty rules
- [ ] Prep doc per application from its archive; story bank carries provenance markers
- [ ] Blacklist gates enforced; company card read-only; suggestions opt-in

## Verification

Unit suites per item; end-to-end: submit → reply email → approved stage change → funnel reflects it →
prep doc generated; calibration output on seeded data matches hand-computed numbers.

## Open risks / unresolved

- Gmail OAuth scope + privacy posture (read-only label scoping, no body storage beyond citations).
- Review pass doubles tailoring token cost on the critical path — keep it opt-in and measurable.
- Calibration is meaningless before ~20 resolved applications; ship the report with that stated.
