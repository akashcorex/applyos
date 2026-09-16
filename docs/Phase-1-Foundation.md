# Phase 1 — Foundation: Canonical Data + Confirm Profile

## Goal
At the end of Phase 1 the user can sign up, upload a resume, see an accurate extracted Profile, edit/confirm it, and the system has one canonical schema path — without any job discovery or applying existing yet.

## Depends on
No prior phase. Consumes: existing `POST /v1/resumes/upload`, `Profile.upsert` callback, `GET /v1/me` onboarding flags. This phase produces the Profile contract that Phase 2 matching consumes.

## Schema changes
Per `MVP-Scope.md` disposition matrix. Single shared Postgres, so fix with real FKs — no sync mechanism:
- Alter `profiles`: add `preferredRoles String[] @default([])`, `preferredLocations String[] @default([])`, `workMode String?`, `seniority String?`, `totalExperienceYears Int?`.
- Add real DB FKs in the Prisma migration (replace app-level joins): `profiles.sourceResumeFileId → resume_files.id ON DELETE SET NULL` (currently a plain String with no constraint); keep and enforce existing `resume_files.resumeId → resumes.id ON DELETE SET NULL`, `resumes.userId → user.id ON DELETE CASCADE`, and the `resumes → resume_source_documents → resume_ir_revisions → resume_tailoring_patches → resume_artifacts / resume_latex_sources / resume_compile_jobs / resume_variants → variant_versions` chain already declared in Prisma (currently duplicated by agent DDL).
- Delete behavior (locked, Decision 7): soft delete on `resume_files` (`deletedAt` timestamp; UI filters `deletedAt IS NULL`; no physical cascade). Deleting/archiving a file never wipes downstream `resumes → variants → patches → artifacts` — old tailored variants tied to old jobs stay intact across re-uploads. Hard `CASCADE` rejected (silently destroys user work); `RESTRICT` rejected (forces explicit cleanup UX not needed pre-launch). `ARCHIVED` status + `deletedAt` set together; downstream rows keep their FKs untouched.
- Ownership fix: delete `CREATE TABLE / ALTER TABLE` DDL from `apps/resume-agent/dependencies.py` for the 10 mirrored tables; Prisma migrations become the sole schema path (agent keeps SQL read/write). Guard check (`to_regclass('public.resumes')`) stays.
- Backfill (locked): silent default + optional reconfirm. New columns default empty/null; backfill by re-running existing extraction against stored resume text/IR (no re-upload). Backfill does NOT auto re-trigger matching — picked up lazily on next match run. No forced reconfirm gate. Confidence-gated forced reconfirm is post-MVP only.

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
- [ ] `profiles.sourceResumeFileId` FK enforced at DB level (invalid IDs rejected, deletes SET NULL)
- [ ] Archiving/deleting a `resume_files` row sets `ARCHIVED + deletedAt` only — downstream variants/artifacts remain queryable (no cascade wipe)
- [ ] Existing users backfilled silently from stored text/IR with no forced reconfirm; backfill does not trigger a match run
- [ ] Edits do not auto re-trigger matching; stale-match banner copy exists

## Open risks / unresolved
- Cross-language schema drift: resume-agent (Python/asyncpg raw SQL) has no ORM guard against Prisma migrations. Rule locked: schema changes only ever originate in `schema.prisma`, and any migration touching a `Resume*` table requires a corresponding review of resume-agent's raw SQL in the same PR.
- PDF text-extraction quality for scanned/image resumes (422 path exists; OCR scope stays post-MVP).
- Backfill coverage: if stored text/IR is missing or low-confidence for a field, leave null and let user fill on confirm screen (no forced gate).
