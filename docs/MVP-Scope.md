# MVP Scope — Entities, Decisions, Table Disposition

## Terminology (used consistently across all docs)
"Profile" and "Candidate Profile" are the same entity: the Prisma `Profile` row extended per Decision 1. All phase docs say "Profile".

## MVP proves one thing
Can ApplyOS reliably take a resume and help submit relevant applications with a tailored resume?

## Six locked decisions

### 1. Profile schema (MVP)
Default: keep existing Prisma `Profile` columns and add five nullable columns: `preferredRoles String[] @default([])`, `preferredLocations String[] @default([])`, `workMode String?` (`remote|hybrid|onsite`), `seniority String?` (`intern|junior|mid|senior|staff`), `totalExperienceYears Int?`. Matching reads `totalExperienceYears (fallback Resume.experienceYears), skills[], preferredRoles, preferredLocations, workMode, seniority` plus `experience[]/education[]` JSON for display.
Rationale: zero table rename, one small migration; `Resume` already stores `experienceYears/preferredRole/preferredLocations` so confirm-step can copy them over without re-parsing. Revisit: split to a separate `CandidateProfile` table post-MVP if matching needs versioning.

### 2. Editable vs read-only extraction
Default: editable, allowlist-only. Editable: `fullName, headline, location, professionalSummary, skills, preferredRoles, preferredLocations, workMode, seniority, linkedinUrl, githubUrl, portfolioUrl, experience, education, projects`. Read-only: `extractionVersion, sourceResumeFileId, lastExtractedAt, confirmedAt` (system-set). Edits save immediately but do NOT auto re-trigger matching; UI marks prior `MatchSession.top_results` stale and offers "Re-run matching".
Rationale: avoids expensive recompute loops on every keystroke and keeps `isConfirmed` semantics clean (confirm = user accepts current snapshot). Revisit: auto re-match on save post-MVP.

### 3. Canonical Job model
Default fields: `id uuid PK, dedupKey text UNIQUE, source text (ats_slug), externalId text?, companyName text, title text, titleNormalized text, location text, locationNormalized text, locationType text?, seniority text?, descriptionRaw text?, descriptionHash text?, applicationUrl text?, postedAt timestamptz?, firstSeenAt timestamptz, lastSeenAt timestamptz, rawPayload jsonb DEFAULT '{}', isActive bool DEFAULT true`. `dedupKey = build_dedup_key(namespace, title_norm, location_norm)` (existing `dedup.py:31-36`); content change detected via `listing_fingerprint` (existing `:55-68`).
Rationale: mirrors what job-agent already computes plus centralizes the per-instance SQLite `job_snapshots(first_seen/last_seen)` logic into Postgres so "seen yesterday" works across instances. Revisit: add `compMin/compMax/currency/equity` when parsers reliably provide them.

### 4. Matching weights
Default: keep current formula — `score = round((0.7*semantic + 0.3*skill_overlap)*100, 1)` (`skills.py:186`) with `seniority_allowed` as a hard gate before scoring (`matcher.py:98-99`), sort desc, no LLM reordering (`explain_top_k` display-only).
Rationale: already implemented, tested, and explainable; changing weights before Profile fields lock would invalidate baselines. Revisit post-MVP using `MatchInteraction(click/apply/skip)` feedback.

### 5. Tailoring lifecycle
Default sequence: `job-select → ResumeVariant(draft) → ResumeTailoringPatch(approved) → ResumeCompileJob(queued→running→succeeded|failed, retries ≤ maxAttempts 3) → ResumeArtifact → user approve/retry → Application`. User can approve or reject a variant (reject → new patch attempt, stays `draft`); system auto-retries failed compiles; user cannot hand-edit `.tex` in MVP (single template, `source_mode=structured` only).
Rationale: matches the existing `variants.py` prepare/compile/enqueue chain without adding an editor or multi-template gallery. Revisit: manual tex edit + template picker post-MVP.

### 6. Final table set
See disposition matrix below — it is the decision. Summary: keep all 34 Prisma models, fix ownership (Prisma migrations sole DDL path), add `jobs, companies, saved_jobs, notifications`, defer `outreach_emails` table (no sender in MVP).

## Table disposition matrix

| Table | Current owner | Disposition | Target owner | Reason |
|---|---|---|---|---|
| `user` | Prisma | keep as-is | Prisma | identity root |
| `session` | Prisma | keep as-is | Prisma | auth infra |
| `account` | Prisma | keep as-is | Prisma | OAuth linkage |
| `verification` | Prisma | keep as-is | Prisma | auth infra |
| `profiles` | Prisma | keep + alter (add Decision 1 columns) | Prisma | canonical Profile |
| `resume_files` | Prisma (API writes) | keep as-is | Prisma | upload record |
| `resume_extractions` | Prisma (API writes) | keep as-is | Prisma | extraction revisions |
| `resumes` | Prisma schema + agent ALTERs | keep, remove agent DDL | Prisma | agent keeps R/W, no DDL |
| `resume_source_documents` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | same DB, one migration path |
| `resume_ir_revisions` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | same |
| `resume_tailoring_patches` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | same |
| `resume_artifacts` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | same |
| `resume_latex_sources` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | single template in MVP, table stays |
| `resume_compile_jobs` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | compile queue stays Postgres |
| `resume_variants` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | tailoring draft store |
| `variant_versions` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | finalize/restore only, keep |
| `workflow_runs` | Prisma | keep as-is | Prisma | durable run |
| `workflow_jobs` | Prisma | keep, becomes join to `jobs` in Phase 2 (add `jobId` FK, keep `dedupKey`) | Prisma | per-run join, not canonical job |
| `applications` | Prisma | keep as-is | Prisma | central object |
| `application_events` | Prisma | keep as-is | Prisma | audit trail |
| `human_interventions` | Prisma | keep as-is | Prisma | HITL queue |
| `agent_tasks` | Prisma | keep as-is | Prisma | orchestrator dispatch |
| `workflow_events` | Prisma | keep as-is | Prisma | durable event log |
| `match_sessions` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | discovery runs |
| `match_interactions` | Prisma schema + agent DDL mirror | keep, remove agent DDL | Prisma | click/apply/skip feedback |
| `user_preferences` | Prisma | keep + alter (add `dailyLimit Int?, minScore Int?` in Phase 2; defer `emailAlerts`) | Prisma | throughput controls |
| `analytics_events` | Prisma | keep as-is | Prisma | product analytics |
| `analytics_identities` | Prisma | keep as-is | Prisma | anon→user link |
| `linkedin_connects` | Prisma | keep as-is | Prisma | stays separate from email outreach |
| `audit_logs` | Prisma | keep as-is | Prisma | admin actions |
| `billing_customers` | Prisma | keep as-is | Prisma | Dodo link |
| `subscriptions` | Prisma | keep as-is | Prisma | plan state |
| `usage_cycles` | Prisma | keep as-is | Prisma | credit windows |
| `processed_webhooks` | Prisma | keep as-is | Prisma | webhook dedup |
| `board_registry` (SQLite) | job-agent SQLite | keep as-is (local cache) | job-agent | ATS registry, not product data |
| `job_snapshots` (SQLite) | job-agent SQLite | keep local, supersede logic in Phase 2 `jobs.firstSeenAt/lastSeenAt` | Prisma `jobs` | per-instance cache → central timestamps |
| `jobs` | — (gap) | add new (Decision 3 fields) | Prisma | canonical job, Phase 2 |
| `companies` | — (gap) | add new (`id, name UNIQUE, domains[], atsType?, atsSlug?, logoUrl?, createdAt`) | Prisma | dedup company strings, Phase 2 |
| `saved_jobs` | — (gap) | add new (`userId, jobId UNIQUE[userId,jobId], createdAt`) | Prisma | bookmark join, distinct from match feedback, Phase 2 |
| `notifications` | — (gap) | add new (`id, userId, type, title, body, readAt?, createdAt`) but do not build sender in MVP | Prisma | log table only, sender post-MVP |
| `outreach_emails` | — (gap) | drop (defer, do not create in MVP) | — | no sender (`/outreach/send=501`); `LinkedinConnect` stays unrelated |

## Explicit non-goals (MVP)
Email outreach send, LinkedIn auto-connect, multiple LaTeX templates, manual `.tex` editor, resume restore gallery UI, company CRM UI, notification sender, admin deep analytics, complex workflow builder.

## Lock checklist before code
- [ ] Prisma migration adds Profile Decision-1 columns + `jobs/companies/saved_jobs/notifications`
- [ ] Agent DDL removal verified (no `CREATE/ALTER` at agent startup except guard check)
- [ ] Confirm-profile screen spec'd (Decision 2 allowlist)
- [ ] Job + Match schema locked (Decision 3+4)
- [ ] Application + tailoring lifecycle locked (Decision 5)
- [ ] Credit rule (1 submitted = 1 credit) enforced everywhere
