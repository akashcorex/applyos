# MVP Scope — Entities, State, Non-Goals

## Conceptual MVP entities (not 33 tables)
```
USER, PROFILE, RESUME, RESUME_VERSION, JOB, WORKFLOW, WORKFLOW_JOB,
MATCH, TAILORED_RESUME, APPLICATION, APPLICATION_EVENT,
HUMAN_INTERVENTION, USAGE_CYCLE, SUBSCRIPTION, AUDIT_LOG
```
Rest (`sessions, accounts, verification, analytics_identities, processed_webhooks`, etc.) = infra/auth/billing plumbing, not product domain. Don't design product around them.

## Table disposition (after Phase 1 lock)
- Keep: `user, profile, resume_files, resume_extractions, workflow_runs/jobs, applications/events/interventions, agent_tasks/workflow_events, match_sessions/interactions, user_preferences (extend), usage_cycles, subscriptions/billing_customers`
- Merge/fix: agent-only `Resume/Variant/IR/Patch/Artifact/LatexSource/CompileJob` → single ownership under API DB
- Add: first-class `jobs + matches` (Phase 2)
- Drop/defer: outreach tables, notifications, company CRM, multi-template, tex editor

## Explicit non-goals
Email outreach, LinkedIn auto-connect, multiple LaTeX templates, manual LaTeX editor, resume restore gallery, company CRM, advanced notifications, admin deep analytics, complex workflow builder.

## MVP proves one thing
> Can ApplyOS reliably take a resume and help submit relevant applications with a tailored resume?

## Lock checklist before code
- [ ] Canonical resume/profile ownership decided
- [ ] Confirm-profile screen spec'd (fields + edit)
- [ ] Job + Match schema locked
- [ ] Application state machine locked
- [ ] Credit rule (1 submitted = 1 credit) enforced everywhere
