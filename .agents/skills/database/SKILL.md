---
name: database
description: Use when working with the database layer. Triggers include "set up the database", "add a table", "add a column", "write a query", "run migrations", "set up Drizzle", "connect to Postgres", "add an index", or anything touching @org/database.
---

# database

PostgreSQL + Drizzle ORM patterns for the Outreach Autometer monorepo.

All database code lives in `packages/database` and is consumed only by `apps/api`.
Python agents never touch the DB directly — they call the API over HTTP.

---

## Tech decisions (do not re-debate these)

| Decision | Choice | Reason |
|----------|--------|--------|
| Primary DB | PostgreSQL | Relational integrity, `jsonb`, `pgvector` path |
| ORM | Drizzle ORM | Bun-native, schema-first, no magic, type-safe SQL |
| Migrations | Drizzle Kit | Generated SQL migrations, committed to the repo |
| Queues | BullMQ on Redis | Async agent work (see `@org/queue`) |
| Large blobs | Object storage (S3/R2) | Resumes, attachments — not stored in Postgres |

---

## Package structure

```
packages/database/
├── src/
│   ├── index.ts          # exports: db, schema, types
│   ├── client.ts         # Drizzle client singleton
│   ├── schema/
│   │   ├── index.ts      # barrel export of all tables
│   │   ├── users.ts
│   │   ├── jobs.ts
│   │   ├── applications.ts
│   │   └── outreach.ts
│   └── migrations/       # generated SQL files (committed)
├── drizzle.config.ts
└── package.json
```

---

## Initial setup

### 1. Install dependencies

From repo root:

```bash
bun add drizzle-orm postgres --workspace packages/database
bun add -d drizzle-kit --workspace packages/database
```

### 2. Drizzle config

```ts
// packages/database/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './src/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 3. DB client singleton

```ts
// packages/database/src/client.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

### 4. Barrel export

```ts
// packages/database/src/index.ts
export { db } from './client';
export * from './schema';
```

### 5. Add `DATABASE_URL` env var

Add to `apps/api/.env`:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach
```

Add placeholder to `apps/api/.env.example`:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/outreach
```

---

## Schema patterns

### Standard table shape

Every table follows this baseline:

```ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Rules:
- Always use `uuid` primary keys with `defaultRandom()`.
- Always include `createdAt` and `updatedAt`.
- Use `withTimezone: true` on all timestamps.
- Use `text` not `varchar` — Postgres treats them identically, `text` is simpler.

### Status/enum columns

Use Postgres `pgEnum` for bounded string sets:

```ts
import { pgEnum } from 'drizzle-orm/pg-core';

export const jobStatusEnum = pgEnum('job_status', [
  'discovered', 'shortlisted', 'applied', 'rejected', 'archived',
]);

// In the table:
status: jobStatusEnum('status').notNull().default('discovered'),
```

### JSONB for flexible agent payloads

```ts
import { jsonb } from 'drizzle-orm/pg-core';

agentOutput: jsonb('agent_output'),   // stores raw LLM/tool output
```

Do not put queryable fields in `jsonb`. Only use it for blobs that you never filter/join on.

### Foreign keys

```ts
import { references } from 'drizzle-orm/pg-core';

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id').notNull().references(() => jobs.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  ...
});
```

---

## Core schema overview (intended)

```
users
  id, email, name, createdAt, updatedAt

jobs
  id, userId (fk), title, company, url, status (enum), agentOutput (jsonb), createdAt, updatedAt

applications
  id, jobId (fk), userId (fk), coverLetterText, status (enum), submittedAt, agentOutput (jsonb), createdAt, updatedAt

outreach_campaigns
  id, userId (fk), targetName, targetCompany, targetEmail, messageText, status (enum), sentAt, repliedAt, createdAt, updatedAt

agent_runs
  id, userId (fk), agentName, input (jsonb), output (jsonb), status, startedAt, finishedAt
```

---

## Query patterns in `apps/api`

### Select

```ts
import { db, jobs } from '@org/database';
import { eq } from 'drizzle-orm';

// All jobs for a user
const userJobs = await db.select().from(jobs).where(eq(jobs.userId, userId));

// Single job
const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
if (!job) return res.status(404).json({ error: 'Not found' });
```

### Insert

```ts
const [created] = await db.insert(jobs).values({
  userId,
  title: input.title,
  company: input.company,
  url: input.url,
}).returning();
```

### Update

```ts
const [updated] = await db
  .update(jobs)
  .set({ status: 'applied', updatedAt: new Date() })
  .where(eq(jobs.id, jobId))
  .returning();
```

### Delete (soft-delete preferred)

Prefer `status: 'archived'` over hard deletes for user data. Use hard delete only for admin cleanup.

---

## Migrations workflow

```bash
# After changing schema files:
bun nx run @org/database:generate    # produces SQL in src/migrations/

# Review the generated SQL before applying
cat packages/database/src/migrations/<timestamp>.sql

# Apply to local Postgres:
bun nx run @org/database:migrate

# Push schema directly (dev only, no migration file):
bun nx run @org/database:push
```

Add these targets to `packages/database/package.json`:

```json
{
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "push": "drizzle-kit push",
    "studio": "drizzle-kit studio"
  }
}
```

---

## Local Postgres with Docker (recommended for dev)

Add to `infra/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: outreach
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

Start with:

```bash
docker compose -f infra/docker-compose.yml up -d
```

---

## Rules — do not break these

- Only `apps/api` imports from `@org/database`. Web and Python agents do not.
- Never put credentials in code. Always read from `process.env.DATABASE_URL`.
- Commit generated migration SQL files alongside schema changes.
- Never run `push` in production — always use `migrate` with committed migration files.
- Validate all DB inputs with Zod before they reach Drizzle.
