# @applyso/validation

Centralized [Zod 4.5](https://zod.dev) validation for the entire repo — the
single source of truth for every request/response/form payload shared by the
Next.js frontend (`apps/web`) and the Express backend (`apps/api`).

## Use

```ts
// Backend (Express middleware, auto-400 on failure)
import { compiledResumeCreateSchema, validateBody } from '@applyso/validation';
resumesRouter.post('/', validateBody(compiledResumeCreateSchema), handler);

// Frontend (Route Handler)
import { jobApplySchema, parseJsonBody } from '@applyso/validation';
const parsed = await parseJsonBody(request, jobApplySchema);
if (!parsed.ok) return parsed.response;

// Frontend (forms / Server Actions)
import { signupSchema, validateAction } from '@applyso/validation';
const parsed = validateAction(signupSchema, { name, email, password });

// Boolean fast path (up to 16x faster on invalid data — no output, no error)
import { isValid } from '@applyso/validation';
if (!isValid(resourceIdSchema, id)) return 400;
```

## Performance

Hot schemas ship pre-compiled (`z.compile`, ~3–9x faster). To auto-compile
everything else, import once at the server entry point **before** any module
that defines schemas:

```ts
// apps/api/src/main.ts
import '@applyso/validation/compile';
```

## Python bridge

The FastAPI agents own their Pydantic models; the TS boundary mirrors them
(`jobs.ts` ↔ `apps/job-agent/models.py`, `outreach.ts` ↔
`apps/outreach-agent/models.py`). Boundary contracts are exported as JSON
Schema for cross-language drift checks:

```sh
bun --filter @applyso/validation snapshot-json-schema  # regenerates contracts.snapshot.json
bun run format                                          # Prettier collapses short arrays
```

## Enum sync

DB tuples live in `packages/database/src/enums.ts` and are duplicated here
as Zod enums so browser bundles never pull in the database client.
`src/enums.drift.test.ts` fails if the copies diverge — update the database
schema first, then mirror it in `src/enums.ts`.
