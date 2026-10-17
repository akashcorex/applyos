# Job Agent TODO — scores on discover + per-user ranking

Context: session discovery already returns `score` per job (resume-agent
`match_score`, rendered as dots + number in `PersistedDiscoveryPanel`, ranked
by `rank`). The `?fresh=true` feed (`GET /v1/jobs`) returns **no score**, so
new jobs render unscored and unsorted. Seniority gating exists
(`services/seniority.py` here, mirrored in resume-agent
`services/matching/seniority.py`) but experience/title only _filter_ — they
don't differentiate ranking per user yet.

## Track A — show score for every job, sort by score

- [ ] A1. Define one shared scoring contract:
      `{ score 0-100, components: { skills, title, seniority }, reason }`.
      Today `_score_job` (resume-agent `matcher.py`) is skills-only and the
      formula lives far from the data. Decide owner: job-agent
      `services/semantic_match.py` vs resume-agent. Single owner, other side
      passes through.
- [ ] A2. Score the fresh feed per requesting user. `GET /v1/jobs?fresh=true`
      must accept the caller's profile (role, skills, `experience_years`,
      seniority) and return `score` + `reason` per job, computed with the
      same contract as A1. Watch cost: fresh feed is up to 100 jobs; batch
      the math, no per-job LLM calls. Deterministic formula only
      (embeddings allowed, cached).
- [ ] A3. API: include `score`/`reason` in `savedJobResponse`
      (`apps/api/src/routes/jobs.ts`) so session, fresh, and saved views share
      one shape. Extend `test_phase2_http.test.ts`.
- [ ] A4. Web: `PersistedDiscoveryPanel` sorts by score desc by default and
      adds a score/newest toggle. Fresh cards reuse the existing `JobCard`
      score dots — no new design needed.
- [ ] A5. Deduplicate seniority logic: `services/seniority.py` and resume-agent
      `services/matching/seniority.py` implement the same bands. Pick one
      source of truth (job-agent owns it; resume-agent calls
      `/search` params or a shared package) and delete the fork.
- [ ] A6. Acceptance: two users with different skills see different scores on
      the same fresh job; `bun test` + `tests/run.py job-agent` green.

## Track B — rank by experience + title per user (later)

Goal: the same discover page orders differently for a 2-yoE frontend junior
vs an 8-yoE backend senior, and explains why.

- [ ] B1. Title affinity component: similarity(profile `preferredRoles` +
      resume titles ↔ job `titleNormalized`), 0-100. Title mismatch caps total
      score (a perfect-skills wrong-role job must not outrank a good-fit
      same-role job).
- [ ] B2. Experience-fit component: map `totalExperienceYears` → expected band
      via `max_rank_for_years`; score falls off with band distance (over- and
      under-qualified both penalized, over-qualified penalized less).
      Promote today's boolean `seniority_allowed` gate into a graded signal;
      keep the hard gate only for extreme mismatch (e.g. intern ↔ exec).
- [ ] B3. Weight contract, e.g. `skills 0.5 / title 0.3 / seniority 0.2`,
      tunable per user later from `click`/`skip` interactions (the
      `match_interactions` table already logs these — future learning signal,
      not this pass).
- [ ] B4. Per-user caching: score depends on (user profile version, job).
      Cache key must include profile `updatedAt`/resume version or scores go
      stale when the user edits their profile. Recompute on profile confirm.
- [ ] B5. API/UI: return component breakdown in `reason` (e.g.
      “title 82 · skills 74 · level fit 90”); surface as tooltip on the score.
- [ ] B6. Acceptance: fixture matrix — junior FE vs senior BE profiles over one
      fixed job set — asserts different top-3 order and title-mismatched jobs
      rank lower; add as `tests/test_job_agent_ranking.py` + one API-level
      test with two mocked profiles.

## Non-goals (for now)

- Learning-to-rank from interaction history (data not yet sufficient).
- Real-time rescoring inside the hourly sweep — scoring stays query-time.
