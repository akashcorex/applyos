---
name: scaffold-feature
description: Use when adding a new end-to-end feature that spans the web UI, the API, and one or more Python agents. Triggers include "add a new feature", "build X flow", "implement Y end-to-end", "wire up X in the UI and backend", or any task that touches more than one app layer.
---

# scaffold-feature

Step-by-step guide for adding a new feature to Outreach Autometer from UI to database to agent.

---

## Decision checklist before writing any code

Answer these before touching a file:

- [ ] Does this feature need a new API route, or does an existing one cover it?
- [ ] Does it need a new DB table/column, or does it extend an existing schema?
- [ ] Does it trigger async agent work, or is it fully synchronous in the API?
- [ ] Does it need new shared types between web and API? (→ `@org/types`)
- [ ] Does it need a new UI component, or do existing ones suffice? (→ `@org/ui`)

---

## Layer order — always implement in this sequence

```
1. @org/types      — define the shape first (Zod schema + inferred TS type)
2. @org/database   — add schema / migration if new DB entities are needed
3. apps/api        — implement the route(s) that own the business logic
4. apps/web        — build the UI that calls the API
5. Python agent    — add agent logic only if async background work is needed
```

Never build the UI before the API contract is defined. Never build the agent logic before the queue/API interface is defined.

---

## Step 1 — Define types in `@org/types`

Create or extend a file under `packages/types/src/`:

```ts
// packages/types/src/job.ts
import { z } from 'zod';

export const JobSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  company: z.string().min(1),
  url: z.string().url(),
  status: z.enum(['discovered', 'applied', 'rejected', 'archived']),
  createdAt: z.string().datetime(),
});

export type Job = z.infer<typeof JobSchema>;

// Request/response shapes for the API
export const CreateJobSchema = JobSchema.omit({ id: true, createdAt: true });
export type CreateJobInput = z.infer<typeof CreateJobSchema>;
```

Export from `packages/types/src/index.ts`:

```ts
export * from './job';
```

---

## Step 2 — Add DB schema in `@org/database`

Add a Drizzle table definition:

```ts
// packages/database/src/schema/jobs.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  company: text('company').notNull(),
  url: text('url').notNull(),
  status: text('status').notNull().default('discovered'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

Generate and apply the migration:

```bash
bun nx run @org/database:generate   # generates SQL migration
bun nx run @org/database:migrate    # applies it to the local DB
```

---

## Step 3 — Implement the API route in `apps/api`

```
apps/api/src/
├── routes/
│   └── jobs.ts       # new route file
└── main.ts           # register the router here
```

Route file pattern:

```ts
// apps/api/src/routes/jobs.ts
import { Router } from 'express';
import { db } from '@org/database';
import { CreateJobSchema } from '@org/types';
import { logger } from '@org/logger';

export const jobsRouter = Router();

jobsRouter.post('/', async (req, res) => {
  const parsed = CreateJobSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);

  const [job] = await db.insert(jobs).values(parsed.data).returning();
  logger.info({ jobId: job.id }, 'job created');
  res.status(201).json(job);
});

jobsRouter.get('/', async (_req, res) => {
  const allJobs = await db.select().from(jobs);
  res.json(allJobs);
});
```

Register in `main.ts`:

```ts
import { jobsRouter } from './routes/jobs';
app.use('/v1/jobs', jobsRouter);
```

---

## Step 4 — Build the UI in `apps/web`

Use Next.js App Router conventions:

```
apps/web/src/app/
└── jobs/
    ├── page.tsx        # list view
    └── [id]/
        └── page.tsx    # detail view
```

Fetch from the API using the `@org/sdk` client (or plain `fetch` until sdk is implemented):

```ts
// apps/web/src/app/jobs/page.tsx
import type { Job } from '@org/types';

async function getJobs(): Promise<Job[]> {
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/jobs`);
  if (!res.ok) throw new Error('Failed to fetch jobs');
  return res.json();
}

export default async function JobsPage() {
  const jobs = await getJobs();
  return (
    <ul>
      {jobs.map(job => <li key={job.id}>{job.title} — {job.company}</li>)}
    </ul>
  );
}
```

---

## Step 5 — Add async agent work (only if needed)

If the feature requires background processing (e.g. scanning jobs, sending emails):

**In the API** — enqueue instead of calling the agent synchronously:

```ts
import { enqueue } from '@org/queue';

// Inside a route handler
await enqueue('job-agent.discover', { userId: user.id, keywords: ['engineer'] });
res.status(202).json({ message: 'Discovery started' });
```

**In the Python agent** — add a worker endpoint the orchestrator can call:

```python
# apps/job-agent/main.py
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="job-agent")

class DiscoverInput(BaseModel):
    user_id: str
    keywords: list[str]

@app.post("/discover")
async def discover(payload: DiscoverInput) -> dict:
    # do the discovery work
    return {"status": "ok", "found": 0}
```

The orchestrator (`ai-orchestrator`) calls `/discover` on `job-agent` and reports back to the API.

---

## Nx project file updates

If you create a new Nx-managed project, add a `project.json` with correct tags:

```json
{
  "name": "my-new-agent",
  "sourceRoot": "apps/my-new-agent",
  "projectType": "application",
  "tags": ["type:app", "lang:python"],
  "targets": { ... }
}
```

Run `bun nx show projects` to confirm it appears.

---

## Checklist before opening a PR

- [ ] Types defined in `@org/types` with Zod schema
- [ ] DB migration generated and tested locally
- [ ] API route validates input with Zod, returns correct status codes
- [ ] Web page fetches from API (not directly from agent or DB)
- [ ] `.env.example` updated if new env vars were added
- [ ] `README.md` updated if setup steps or ports changed
- [ ] `project.agent.md` updated if architecture changed
