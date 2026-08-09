# outreach-agent

`outreach-agent` is the outreach communications service (port 8004). It handles proactive outbound messaging — emails, LinkedIn messages, follow-ups, and sequence-based outreach campaigns.

**Status: scaffold** — core outreach logic is pending implementation.

## What it does (intended)

- **Outreach campaigns** — manage sequences of touchpoints (email, LinkedIn, etc.)
- **Follow-ups** — automated reminder/check-in messages at configurable intervals
- **Messaging** — send templated messages via email or LinkedIn
- **Scheduling** — time-based delivery with frequency capping

## Current endpoints

- `GET /` — service status
- `GET /health` — health check

## Run locally

From the repository root:

```bash
bun run dev:outreach-agent
```

Or from the app directory:

```bash
cd apps/outreach-agent
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8004
```

The service will be available at `http://127.0.0.1:8004`.
