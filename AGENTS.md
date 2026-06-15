<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `bun nx build`, `bunx nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

## Fallow (codebase intelligence)

This repo uses [Fallow](https://github.com/fallow-rs/fallow) for deterministic TypeScript/JavaScript quality analysis. Python agent apps are excluded from Fallow scope.

### When to run

- Before opening or updating a PR that touches TS/JS: `bun run fallow:audit`
- For health score, hotspots, and refactor targets: `bun run fallow:health`
- For cleanup candidates: `bun run fallow:dead-code`
- For duplication: `bun run fallow:dupes`

Machine-readable output: `bun run fallow:audit -- --format json`

### CI

Pull requests run `fallow audit` via `.github/workflows/fallow.yml`. The gate is **new-only** by default: inherited findings are reported but do not fail the job. Fix or suppress issues introduced by your change.

### Agent workflow

1. Generate or edit TS/JS code
2. Run `bun run fallow:audit -- --format json`
3. Inspect findings and per-issue `actions` (check `auto_fixable`)
4. Apply safe fixes before opening a PR

Config: `.fallowrc.json`. Local cache: `.fallow/` (gitignored).

### Runtime coverage (Node beacon)

The API service (`apps/api`) streams V8 runtime coverage when `BEACON_API_KEY` is set in `.env` (see `.env.example`). **Use `bun run dev:api` only** — it sets `NODE_V8_COVERAGE` before Node starts (cannot be loaded from `.env` at runtime). The beacon posts to `https://api.fallow.cloud` every 60 seconds and on graceful shutdown.
