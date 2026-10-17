# ApplyOS Docs

ApplyOS is an AI-powered job application platform — a Turborepo monorepo with a Next.js frontend
(`apps/web`), Express API (`apps/api`), Python agent services (orchestrator, job, apply, resume,
outreach), one shared Postgres (Prisma, 40 models) and Redis. The core loop: **resume → confirmed
profile → discover → select → tailor → apply (HITL) → track**.

This folder is the **pending implementation plan** plus the current-state references needed to
execute it. Completed MVP phase docs (Phase 1–3) are deliberately absent — see "How phase docs are
written" below.

The plan: **Phase 4–7** — adopting the best process parts of two open-source reference frameworks
into ApplyOS.

## Doc map

| Doc                         | Contents                                                                 | Status  |
| --------------------------- | ------------------------------------------------------------------------ | ------- |
| `Current.md`                | Read-only truth of what exists today                                     | Living  |
| `MVP-Scope.md`              | Locked MVP decisions + table disposition matrix                          | Living  |
| `Phase-4-Foundations.md`    | Score contract, stage ledger, notifications, policy ADRs                 | Planned |
| `Phase-5-Candidate-Loop.md` | Evaluation reports, cover letters, verification, follow-ups, liveness    | Planned |
| `Phase-6-Intelligence.md`   | Reviewer pass, reply sync, funnel/calibration, interview prep, blacklist | Planned |
| `Phase-7-Breadth.md`        | Providers, email sending, contacts, templates, offer/upskill, dedup      | Planned |

Phase 1–3 (shipped MVP) docs were removed from this folder by design: `docs/` carries pending work
only, so an agent never reads already-shipped instructions as if they were the plan. Their history is
in `git log -- docs/`.

## Roadmap at a glance

```
Phase 4        Phase 5           Phase 6            Phase 7
Foundations →  Candidate Loop →  Intelligence    →  Breadth
contracts       close the loop     learn + prep       widen surface
```

The shipped MVP loop (resume → profile → discover → select → tailor → apply → track) is the baseline
this plan extends.

- **Phase 4** ships no feature; it fixes the contracts (one score, one stage ladder, notifications,
  ADRs) that Phases 5–7 would otherwise each fork.
- **Phase 5** is where users feel the difference: a job is evaluated with evidence, gets a CV _and_
  cover letter that are verified as files and as parseable text, and the application is followed up
  when due.
- **Phase 6** makes the loop learn: adversarial review, inbox→stage sync, funnel calibration,
  interview prep from what was actually submitted, company memory.
- **Phase 7** widens inputs and closes the last outbound gap (email with per-send approval).

## The reference frameworks

Two open-source frameworks are vendored (untracked) at the repo root and serve as **process
references**:

- **`career-ops-main/` (v1.37.0)** — single-user CLI-agent job search: 40+ prompt modes, ~150 Node
  scripts, 110 zero-auth job-board providers, evaluation reports with machine-readable summaries,
  liveness + aggregator discipline, follow-up cadence, reply classification, funnel/calibration
  analytics, interview prep, story-bank provenance.
- **`ai-job-search-master/`** — single-user Claude Code workspace: drafter→reviewer application
  pipeline with mandatory PDF layout + ATS text-layer verification, fit evaluation with hard gates,
  uniform portal-CLI contract, follow-ups, Gmail/Notion sync, offline HTML dashboard.

**Adoption rule: port the process and the invariants, never the architecture.** Files-as-truth, CLI
runtimes, and prompt-only logic stay in the references. ApplyOS's platform layer (auth, billing,
quotas, durable workflow ledger, HITL apply automation, evidence-constrained tailoring) is already
ahead of both — the gap is the candidate-journey process around it.

The references are snapshots: verify file paths against the actual snapshot before implementing, and
cite them in PRs with the same paths used in the phase docs.

## Invariants (apply to every phase)

1. **Never auto-submit without an explicit human gate.** Resolve the `autoSubmit` policy in 4.4, then
   enforce it everywhere. (Both references treat this as a hard ethical rule.)
2. **No claim without evidence.** Every generated fact traces to a profile field, resume IR evidence
   id, or verbatim JD text. Numbers in rewritten bullets never change.
3. **Verify the artifact, not the intent.** A compile is not done until layout + text-layer checks
   pass (5.3); a posting is not live until liveness says so (5.5).
4. **Cheap triage first, expensive evaluation last.** Bounded research budgets, cached job facts, no
   nested research agents.
5. **Draft-only for anything outbound** until a human approves per-send (7.2 re-examines this).
6. **Honesty conventions.** State denominators; `— not evaluated` is a first-class state;
   `uncertain ≠ closed`; never invent an employer.

## How phase docs are written

Each planned phase doc follows the convention of `Phase-4-Foundations.md` (read it as the exemplar):

```
Status · Goal · Work items (Problem · What to implement · Where · Reference · Acceptance)
Schema changes · Service/API changes · State machine changes · Explicit non-goals
Definition of done (checkboxes) · Verification · Open risks
```

Rules:

- Item IDs are `<phase>.<n>` (e.g. `5.3`); reference them in PR titles, commits, and reviews.
- Every item names: where it lands in the codebase, the reference file paths it ports, and
  verifiable acceptance criteria.
- When an item ships, tick its box in the phase doc and update the status in this README's doc map
  if the whole phase completes.
- Facts must be verified against code at writing time; when an item ships, record its proof
  (commands/tests) in the PR and tick its Definition-of-done checkbox here.
- **This folder holds pending work only.** When a phase completes, its doc is removed (git history
  keeps it) and the doc map above is updated — an agent reading `docs/` never works from
  already-shipped instructions.

## Cross-phase dependencies

- `4.1` (score) → `5.1` (evaluation report), `6.3` (calibration)
- `4.2` (stage ledger) → `5.4` (follow-ups), `6.2` (reply sync), `6.3` (funnel)
- `4.3` (notifications) → `5.4`, `6.2`
- `4.4` ADR-4 (JD archive) → `6.4` (interview prep); ADR-2 (aggregator) → `5.5`
- `5.1` keywords → `5.3` (keyword coverage); `5.3` verification → all artifact-facing phases
- `6.2` (feedback into the loop) → `6.4` (prep from real feedback); `6.3` data → Phase 7 prioritization

## Explicit non-adoptions

Do not port: files-as-truth/TSV-merge as storage (keep Postgres; port only identity/dedup _semantics_),
CLI-agent-as-runtime, prompt-only logic where code can own the rule, the 20 market-mode i18n
directories, Go TUI, Canva MCP, plugin engine, Hired Wall, multi-model eval routing.

## Do not regress

HITL control plane + live browser takeover; evidence-constrained controlled ops (numbers/dates
immutable); durable workflow ledger + idempotency; credits/quotas/billing correctness; SSE + event
audit trails.

## Cleanup backlog (drift found during the gap analysis)

| Item                                                              | Where                         | Action                                  |
| ----------------------------------------------------------------- | ----------------------------- | --------------------------------------- |
| Model count stale (38 → **40 models**, 13 migrations)             | `docs/Current.md`             | Fixed in this pass                      |
| Landing page claims follow-ups/tailoring not built                | `apps/web` landing components | Resolved by 5.2 / 5.4, or fix copy now  |
| Root README links `LOCAL_DEV.md` (file does not exist)            | `README.md:53`                | Create it or point at `docs/Current.md` |
| `apps/apply-agent` not in `tests/run.py` or CI                    | `tests/run.py`, CI workflow   | Package it (pyproject/uv.lock) first    |
| Password change is UI-only; `/api/runs` BFF has no caller         | `apps/web`                    | Track as bugs, fix opportunistically    |
| `Board registry count 31` referenced in older notes vs 48 entries | `apps/job-agent/docs/*`       | Refresh when touched                    |

## Open decisions

1. **`autoSubmit` policy** — hard human gate vs opt-in autonomy → ADR in `4.4`.
2. **Evaluation timing/cost** — batch at discovery vs on-demand at selection → decide in `5.1`.
3. **Email provider + compliance** — Resend (implemented, unwired) vs SMTP; unsubscribe/volume rules
   → ADR before `7.2`.
4. **Cover letters required or optional** per application → decide in `5.2` (UX + cost).
