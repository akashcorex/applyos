# Phase 1 — Foundation: Canonical Data + Confirm Profile

## Goal
At the end of Phase 1 the user can sign up, upload a resume, see an accurate extracted Profile, edit/confirm it, and the system has one canonical schema path — without any job discovery or applying existing yet.

## Depends on
No prior phase. Consumes: existing `POST /v1/resumes/upload`, `Profile.upsert` callback, `GET /v1/me` onboarding flags. This phase produces the Profile contract that Phase 2 matching consumes.

## Schema changes
Per `MVP-Scope.md` disposition matrix:
- Alter `profiles`: add `preferredRoles String[] @default([])`, `preferredLocations String[] @default([])`, `workMode String?`, `seniority String?`, `totalExperienceYears Int?`.
- No new tables. No changes to `resume_files`, `resume_extractions`, `resumes`.
- Ownership fix: delete `CREATE TABLE / ALTER TABLE` DDL from `apps/resume-agent/dependencies.py` for the 10 mirrored tables; Prisma migrations become the sole schema path (agent keeps SQL read/write). Guard check (`to_regclass('public.resumes')`) stays.

## Service/API changes
- API: Prisma migration for the five Profile columns; `PUT /v1/profiles/me` accepts the Decision-2 allowlist and copies `Resume.experienceYears/preferredRole/preferredLocations` into Profile on first confirm; `POST /v1/profiles/me/confirm` sets `isConfirmed=true, confirmedAt=now()`.
- Resume-agent: remove startup DDL, keep `POST /internal/extract` + callback behavior unchanged.
- Web: replace onboarding redirect with confirm screen: shows Experience, Primary roles, Skills, Preferred location, Seniority + workMode, with [Confirm profile] / [Edit]. Request shapes: `PUT /api/profiles` (allowlist fields), `POST /api/profiles/confirm` (no body).

## State machine changes
No new states. `ResumeFile`: `UPLOADED→PROCESSING→COMPLETED|FAILED` unchanged. `Profile.isConfirmed: false→true` becomes the Phase 1 completion gate (Phase 2 requires `isConfirmed=true` before discovery).

## Explicit non-goals for this phase
Job persistence/matching (Phase 2), tailoring/applying (Phase 3), `jobs/companies/saved_jobs` tables (Phase 2), notification sender + email outreach (post-MVP), multi-template / tex editor (post-MVP).

## Definition of done
- [ ] User can upload PDF/DOCX and reach `COMPLETED` with a Profile within 180s (existing extract timeout)
- [ ] Confirm screen displays totalExperienceYears, preferredRoles, skills, preferredLocations, seniority, workMode
- [ ] Allowlisted Profile fields edit and re-save; read-only fields (`extractionVersion, sourceResumeFileId, lastExtractedAt`) reject edits
- [ ] `GET /v1/me` reports `onboardingComplete=true` only after `hasResume && profileConfirmed`
- [ ] Resume-agent starts with zero DDL writes (log/migration diff proves it) and extract callback still succeeds
- [ ] Edits do not auto re-trigger matching; stale-match banner copy exists

## Open risks / unresolved
- PDF text-extraction quality for scanned/image resumes (422 path exists; OCR scope stays post-MVP).
- Backfill for existing users whose Profile lacks the five new columns (default empty/null + prompt to reconfirm).
