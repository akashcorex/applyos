# Phase 2 — Discovery: Jobs as First-Class Entities

Goal: persist jobs so we can show, explain, save, and dedup them.

## Today
`job-agent → search → normalize → dedup → semantic rank → return` (not stored). `WorkflowJob` created only at apply time, scoped per-run. Can't answer "show me yesterday's jobs / why recommended / already applied?".

## To build
Job entity:
```
externalId, source, company, title, location, description, url,
requirements, skills, seniority, dedupKey
```
Flow:
```
Job → Match → User sees it → User selects job(s)
```

- Normalize + `dedupKey` stays in job-agent (already works).
- API persists canonical jobs on discovery, not just on apply.
- Match record links `Job + Profile + score + reason` so UI can explain ranking.
- User selects 1..N jobs → hands off to Phase 3.

No company CRM, no complex workflow builder in this phase. Just: discover → persist → match → select.
