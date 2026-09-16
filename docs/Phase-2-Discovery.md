# Phase 2 — Discovery: Jobs as First-Class Entities

## Goal

At the end of Phase 2 the user with a confirmed Profile can discover persisted jobs, see why each was recommended, save/bookmark jobs, and select 1–10 jobs for tailoring — without anything being applied yet.

## Depends on

Phase 1 DONE. Consumes: confirmed Profile (Decision 1 fields + Decision 2 allowlist) and canonical Prisma ownership (no agent DDL). Produces the `Job` + selection contract Phase 3 tailoring consumes.

## Schema changes

Per `MVP-Scope.md` disposition matrix:

- Add `jobs` (Decision 3 fields: `dedupKey UNIQUE, source, externalId?, companyName, title, titleNormalized, location, locationNormalized, locationType?, seniority?, descriptionRaw?, descriptionHash?, applicationUrl?, postedAt?, firstSeenAt, lastSeenAt, rawPayload jsonb, isActive`).
- Add `companies` (`name UNIQUE, domains[], atsType?, atsSlug?`).
- Add `saved_jobs` (`userId, jobId UNIQUE[userId,jobId]`) — bookmark join, distinct from match feedback.
- Alter `workflow_jobs`: add nullable `jobId` FK to `jobs` (keep `dedupKey` for back-compat during migration).
- Alter `user_preferences`: add `dailyLimit Int?, minScore Int?` (defer `emailAlerts` until notification sender exists).
- Reuse `match_sessions` (`top_results` with scores) + `match_interactions` (`impression|click|apply|skip`) unchanged; centralize `job_snapshots` SQLite logic into `jobs.firstSeenAt/lastSeenAt`.

## Service/API changes

- Job-agent: parsers/ranking and `dedup_key` + `listing_fingerprint` logic stay; resume-agent applies conservative seniority, work-mode, and preferred-location filters while retaining jobs with unknown metadata. SQLite `job_snapshots` remains local cache only.
- API (new, all `requireAuth` + confirmed-Profile gate): `POST /v1/jobs/discover {profileId, query?, limit?}` → persists/updates `jobs` + creates `match_sessions` → returns ranked `[{job, score, reason}]`; `GET /v1/jobs?saved?&q?` (list with `isSaved` flag); `PUT /v1/jobs/:id/save` / `DELETE /v1/jobs/:id/save` (upsert/delete `saved_jobs`); `POST /v1/jobs/:id/select` creates an owned `JobSelection` with 1–10 unique job IDs and returns `selectionId`; `GET /v1/jobs/selections/:id` reads the owned canonical selection.
- Response shape for discover: `{sessionId, jobs: [{id, dedupKey, companyName, title, location, seniority, score, reason, firstSeenAt, isSaved}], latencyMs}`.
- Web: discovery calls discover → records rendered impressions → supports save/skip → selection CTA creates a `selectionId` and opens `/dashboard/auto-apply?selectionId=...`. No application is started in the discovery page.

## State machine changes

- `WorkflowJob`: add `matched` creation path from persisted `jobId` (statuses `discovered|matched|skipped|rejected|application_queued` unchanged, per `enums.ts:34-40`).
- `MatchInteraction.event_type`: `impression` on discover render, `click` on detail, `skip` on dismiss — `apply` event still written only by Phase 3.
- No application states change in this phase.

## Explicit non-goals for this phase

Applying/submitting/credits (Phase 3), tailoring variants (Phase 3), outreach emails + LinkedIn auto-connect (post-MVP), notification sender (post-MVP; `notifications` table created but unwritten), comp/salary fields (post-MVP per Decision 3).

## Definition of done

- [x] Confirmed user can run discover and get persisted `jobs` with `score + reason` in one call
- [x] Re-running discover for the same company/title/location updates `lastSeenAt` instead of duplicating (`dedupKey` unique holds)
- [x] "Seen yesterday" query returns prior `jobs` by `firstSeenAt/lastSeenAt`
- [x] Save/unsave toggles `saved_jobs` and survives reload; saved list filters correctly
- [x] Selecting >10 jobs or unconfirmed Profile is rejected with a clear error
- [x] `MatchInteraction` rows record `impression/click/skip` for the session

## Open risks / unresolved

- ATS coverage gaps (parsers exist only for greenhouse/lever/ashby/workable/recruitee/personio/wellfound; others return empty with a clear message).
- Semantic embedding availability fallback returns unranked results (existing `semantic_rank_jobs` behavior) — acceptable for MVP, flagged in UI.
