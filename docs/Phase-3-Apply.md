# Phase 3 — Tailor → Apply → Track

Goal: prove **resume → tailored resume → submitted application** reliably.

## Flow
```
User selects job(s)
  ↓
Resume Agent → job-specific tailored resume (1 template for MVP)
  ↓
Apply Agent → open → fill → upload tailored resume → submit
  ↓
Blocker?
├─ NO → SUBMITTED
└─ YES → HUMAN_INTERVENTION → USER CONTROL → RESUME → SUBMITTED
```

## Application is the central object
```
Job → Application { tailored resume, status, events, browser session, intervention }
```
Lifecycle (already mostly present, keep it):
`PENDING → QUEUED → RUNNING → WAITING_FOR_HUMAN → RESUMING → SUBMITTED`
Failures: `failed / captcha_blocked / already_applied / login_required / timed_out / skipped / cancelled`.

## Credits (lock rule)
**1 successful submission = 1 credit.** Not start = credit.
Free 25 / Starter 150 / Pro 400 / Power 1000. Current code already increments only on first `submitted` — keep that.

## Out of scope here
Single LaTeX template only. No manual `.tex` editor, no version gallery/restore, no LinkedIn auto-connect, no email outreach. Track via `Application + ApplicationEvent + HumanIntervention` only.
