# DEFERRED: SERP-driven company discovery (needs budget)

Status: parked until a paid search-API budget is approved. Everything else
in the discovery plan (cheap gates, verify-on-queue, new vendors, board
packs) ships without it.

## Why it matters

All current discovery only scrapes boards already in the registry (31
companies). YC/funding lists add known startups. Nothing finds *unknown*
companies hiring for the target role. career-ops solves this with
`site:`-scoped web-search queries per portal (e.g.
`site:boards.greenhouse.io "AI Engineer"`, `site:jobs.ashbyhq.com
"Product Manager"`), then verifies each hit against the live board.

## Design sketch (when funded)

- Pluggable SERP provider behind a tiny interface
  (`search_queries(query, site) -> [{title, url}]`). Candidates: Brave
  Search API, Serper. Both are paid per-query; evaluate pricing then.
- Queries derived from the target profile: 2-3 portal scopes × top
  role titles. Hard per-run query budget (e.g. 20) + dedupe candidate
  domains against the registry *before* any probing.
- Candidates feed the existing pipeline unchanged: detect ATS →
  verify live jobs → upsert-or-park via `POST /registry/grow`
  (add `source: "serp"` next to `yc`/`detect`).
- Stale-result guard (their lesson): SERP snippets lag live boards, so
  every candidate must pass the verify step; unverified hits are
  parked, never queued.

## Trigger to implement

Budget approved for a SERP key → add `SERP_API_KEY` env (optional,
documented) → implement provider + `source: "serp"` path with hermetic
tests (fake SERP responses through grow) → live dry-run proving ≥1
new verifiable board → commit.
