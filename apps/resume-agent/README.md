# resume-agent

`resume-agent` is the Python FastAPI service that ingests a user's resume
(PDF/DOCX), extracts a versioned evidence-backed Resume IR, matches it against
current job listings, and compiles job-specific resume artifacts for preview
and application.

## What it does

The service exposes four core flows:

- `POST /parse` uploads a resume file, extracts text, runs Claude to produce a
  structured compatibility record, and persists an immutable Resume IR revision
  with source-document provenance.
- `GET /resume/{id}` retrieves a previously parsed resume.
- `GET /resume/{id}/match` matches the current IR projection and re-ranks
  results by deterministic skill overlap.
- Variant routes create evidence-checked tailoring patches and compile
  content-addressed PDF artifacts.

## Architecture

The service is designed as a resume compiler rather than a full-resume
generator:

```text
Upload PDF/DOCX
      |
      v
Parser + source spans
      |
      v
Claude structured extraction
      |
      v
Resume IR revision
  - stable node IDs
  - immutable facts
  - evidence/provenance
      |
      +--> derived evidence index / embeddings
      |
      +--> matching projection --> job-agent
                                      |
                                      v
                              matched job context
                                      |
                                      v
                         relevant evidence retrieval
                                      |
                                      v
                         TailoringPolicy + patch
                                      |
                                      v
                         validation + semantic diff
                                      |
                                      v
                           ResumeCompiler artifact
                                      |
                         +------------+------------+
                         |                         |
                    Web PDF preview            Apply-agent
```

The canonical source is the `ResumeIR`. `ResumeRecord` and `VariantContent`
remain compatibility DTOs while clients migrate. New code should follow the
one-way rule:

```text
legacy API -> adapter -> ResumeIR
```

Do not create a new path that converts `ResumeIR` back into a legacy DTO and
then back into `ResumeIR`.

## Runtime structure

Important modules:

- `main.py` registers the health, resume, matching, and variant routers.
- `dependencies.py` creates the asyncpg pool, repositories, parser, extractor,
  matcher, optional RAG pipeline, and compiler during FastAPI startup.
- `models.py` contains API DTOs and the versioned IR, evidence, job profile,
  tailoring policy, patch, diff, validation, and artifact contracts.
- `services/parser.py` parses PDF/DOCX files into text plus source segments.
- `services/extractor.py` calls Claude with structured output. Its prompt hash
  is persisted with the resulting IR revision.
- `services/ir.py` creates stable IDs, provenance references, IR hashes,
  legacy projections, patch operations, and diffs.
- `services/revisions.py` persists source documents, IR revisions, patches, and
  compiled artifact metadata.
- `services/matching/` calls job-agent and performs local deterministic scoring
  and behavior-based reranking.
- `services/tailoring/` owns variant persistence, suggestion compatibility,
  policy validation, version snapshots, and manual edit handling.
- `services/compiler.py` renders LaTeX, launches the isolated compiler worker,
  creates content-addressed artifacts, and falls back to the deterministic ATS
  renderer when no LaTeX compiler is installed.
- `services/latex_worker.py` is a subprocess boundary for LaTeX compilation.
- `services/storage.py` provides the local development storage implementation.

## Canonical Resume IR

`ResumeIR` contains:

- schema version and source document identity
- candidate identity fields
- stable skill, experience, bullet, and education IDs
- normalized skill names and display values
- evidence references with source hash, page, offsets, excerpts, confidence,
  and assertion/inference/derived classification
- summary, experience, preferred role, and location facts
- extraction and revision metadata

Embeddings are deliberately not stored inside the IR. They are a derived
projection keyed by the IR revision and embedding/index version. Re-embedding
must never mutate the canonical resume revision.

The current compatibility representation is:

```text
ResumeRecord      parsed API/database projection
VariantContent    editable variant DTO
ResumeIR          canonical fact/provenance source of truth
TailoringPatch    approved change set against one IR revision
CompiledArtifact  immutable rendered output metadata
```

## Ingestion lifecycle

`POST /parse` performs the following:

1. Authenticate the `X-User-Id` caller and verify the submitted form user.
2. Read and parse the uploaded PDF/DOCX.
3. Extract structured candidate fields through Claude.
4. Persist the compatibility `resumes` row.
5. Store the original document behind a local storage key.
6. Create a source-document record containing the SHA-256 digest, file type,
   size, and parser version.
7. Create the first immutable IR revision with evidence spans and extraction
   model/prompt provenance.
8. Optionally ingest revision-aware RAG chunks.
9. Optionally compute a derived profile embedding and store its revision/model
   metadata.
10. Return structured resume data, the IR revision ID, and a web-facing source
    document URL. Raw text and absolute filesystem paths are not returned.

Existing resumes without an IR revision are lazily backfilled when retrieved,
matched, or used to create a variant.

## Matching lifecycle

`GET /resume/{resume_id}/match`:

1. Loads the latest IR revision and projects it once into the matcher DTO.
2. Uses normalized skills, role, experience, summary, and recent evidence for
   the job-agent request.
3. Calls job-agent `/search/semantic`, falling back to `/search`.
4. Applies local deterministic skill overlap scoring.
5. Applies behavior/outcome reranking when match analytics are available.
6. Records the match session and returns ranked jobs.

The tailoring service receives only relevant profile/evidence context. It must
not send the complete candidate resume to the tailoring model when a smaller
evidence set is available. Missing job skills are signals for matching; they
are not candidate facts and cannot be added to the resume automatically.

## Tailoring policy and patches

`TailoringPolicy` is the hard safety boundary and is independent of the
model's claimed confidence or risk:

Allowed:

- reorder existing sections, bullets, or skills
- select existing evidence
- rewrite an existing evidence-backed bullet
- summarize existing evidence
- reorder existing skills

Forbidden:

- inventing facts, employers, technologies, metrics, or dates
- changing existing numeric claims
- changing employer, title, date, identity, or education facts
- adding a skill that is not evidenced by the source IR
- applying a patch to a different IR revision

Every accepted patch stores operation IDs, stable node IDs, source revision
hash, before/after values, evidence IDs, policy version, and a semantic/source
diff. Manual editor changes use the same validation path. Legacy suggestions
remain available for UI compatibility, but accepting an unsafe suggestion is
rejected before persistence.

The diff contract has semantic, source, and visual sections. The current UI
renders the semantic section; source/LaTeX and visual/PDF diff generation are
reserved for audit and renderer-regression tooling.

## Variant and compiler lifecycle

Variants are stored with `draft`, `ready`, or `applied` status. A variant
references:

- its job context
- source IR revision
- approved patch
- latest compiled artifact hash

Draft preview:

```text
POST /resume/{resume_id}/variants/{variant_id}/preview
```

This compiles the current draft without marking it ready. Finalization uses:

```text
POST /resume/{resume_id}/variants/{variant_id}/finalize
```

The compiler input is:

```text
ResumeIR + approved TailoringPatch + JobProfile + template options
```

The artifact hash is derived from the IR revision, job profile, patch
operations, policy/schema versions, compiler version, and template version.
Identical inputs therefore share the same content address.

The artifact manifest records:

- artifact UUID and content hash
- source revision ID and patch ID
- storage key and media type
- compiler/template versions
- page count
- validation report
- diff contract
- model/index/compiler provenance

LaTeX is the intended production renderer. Compilation runs through
`latex_worker.py`, with shell escape disabled, Tectonic `--untrusted` when
available, isolated temporary directories, restricted environment variables,
timeouts, and resource limits. The current local environment may not have
Tectonic or `pdflatex`; in that case the deterministic FPDF ATS renderer is
used as a development fallback.

## Persistence

The shared Drizzle schema is in
`packages/database/src/schema/resume.ts`. The resume-agent also applies
startup-safe `CREATE TABLE IF NOT EXISTS`/`ALTER TABLE IF NOT EXISTS`
compatibility statements.

The compiler migration adds:

- `resume_source_documents`
- `resume_ir_revisions`
- `resume_tailoring_patches`
- `resume_artifacts`
- variant source-revision, patch, and artifact references
- embedding revision/model/index metadata

Apply it before running the services:

```bash
bun run db:migrate
```

Development storage currently writes under:

```text
apps/resume-agent/uploads/<user>/...
```

The database and API contract use opaque storage/artifact keys. Object storage
or shared filesystem storage is still required before deploying resume-agent
and apply-agent on separate hosts without a shared local volume.

## Web and apply integration

The Next.js app proxies authenticated routes under
`apps/web/src/app/api/resume`:

- upload and parsing
- matching
- variant CRUD
- draft preview and finalization
- source-document retrieval
- authenticated PDF preview/download
- auto-apply

`ResumeVariantEditor.tsx` provides:

- manual summary, skills, and bullet editing
- AI suggestion review
- draft preview compilation
- inline PDF preview
- PDF download/open actions
- semantic change display
- ready-to-apply status

The canonical apply flow passes an internal artifact URL rather than a local
filesystem path. Apply-agent downloads it using the service token, then
uploads the resulting PDF to the ATS. Decision-engine and direct-apply paths
also require a compiled artifact. There is no default-resume-path fallback in
the canonical apply flow.

## API endpoint summary

### Health

- `GET /`
- `GET /health`

### Source resume

- `POST /parse`
- `GET /resume/{resume_id}`
- `GET /resume/{resume_id}/source`
- `GET /resume/{resume_id}/latest-artifact`

### Matching and RAG

- `GET /resume/{resume_id}/match`
- `POST /resume/{resume_id}/match/interactions`
- `GET /resume/{resume_id}/match/sessions`
- `POST /resume/{resume_id}/chat`
- `POST /resume/{resume_id}/improve`

### Base profile and variants

- `GET/PATCH /resume/{resume_id}/base-profile`
- `GET/POST /resume/{resume_id}/variants`
- `GET/PATCH /resume/{resume_id}/variants/{variant_id}`
- `POST /resume/{resume_id}/variants/{variant_id}/suggest`
- `POST /resume/{resume_id}/variants/{variant_id}/preview`
- `POST /resume/{resume_id}/variants/{variant_id}/finalize`
- `GET /resume/{resume_id}/variants/{variant_id}/pdf`
- `GET /resume/{resume_id}/variants/{variant_id}/versions`
- `POST /resume/{resume_id}/variants/{variant_id}/versions/{version_id}/restore`
- `POST /resume/{resume_id}/variants/{variant_id}/mark-applied`

### Trusted worker endpoint

- `GET /internal/artifacts/{artifact_hash}`

This endpoint requires `X-Agent-Service-Token` and is intended only for
trusted backend workers. It must not be exposed directly to browsers.

## Security rules

- Every user-facing resume route requires ownership verification.
- The browser receives opaque URLs/IDs, not absolute backend paths.
- Raw extracted text remains internal to the resume pipeline.
- Artifact downloads for apply workers require `AGENT_SERVICE_TOKEN`.
- LaTeX content is untrusted and must never be compiled inside the web/API
  process or with shell escape enabled.
- The resume-agent port should be network-isolated from untrusted clients;
  `X-User-Id` is a trusted service-to-service identity header, not a browser
  authentication mechanism by itself.

## AGENT_SERVICE_TOKEN

`AGENT_SERVICE_TOKEN` is a shared secret used only for trusted
backend-to-backend calls. In this flow:

```text
resume-agent creates artifact
      |
apply-agent requests artifact with X-Agent-Service-Token
      |
resume-agent verifies the token
      |
apply-agent downloads the PDF
```

It is not an AI token, user ID, resume ID, or browser session token. It should
be a high-entropy random value, stored in backend `.env` files only, and never
prefixed with `NEXT_PUBLIC_` or sent to frontend JavaScript. The same value
must be configured in the services that participate in the internal artifact
download flow.

## Current limitations and migration notes

- The IR and artifact contracts are implemented, but the legacy
  `ResumeRecord`, `base_profile`, and `VariantContent` columns remain for
  compatibility during migration.
- Existing resumes are lazily backfilled into IR revisions. Existing variants
  can still be read through their legacy PDF path while they are migrated to
  artifact hashes.
- Local filesystem storage is the development implementation. Use shared or
  object storage before separating services across hosts.
- RAG and embeddings are optional. The core parse, IR, matching, policy, and
  compiler paths should not require them when provider keys are absent.
- Tectonic/pdflatex must be installed in the production worker image to use
  the LaTeX renderer. Without it, local development uses the FPDF fallback.
- The artifact URL used by apply-agent must be reachable from the
  apply-agent host, and `RESUME_AGENT_URL` must match the URL prefix configured
  in apply-agent so it attaches the service token to downloads.
- Run the full repository tests after schema or contract changes:

```bash
python3 tests/run.py all
bun run build:web
```

## Local config

The app reads environment values from `apps/resume-agent/.env`. Copy
`.env.example` and fill in:

- `ANTHROPIC_API_KEY` -> Claude API key
- `DATABASE_URL` -> Postgres connection string
- `JOB_AGENT_URL` -> base URL of the job-agent service (default `http://127.0.0.1:8002`)
- `AGENT_SERVICE_TOKEN` -> shared trusted token for apply-agent artifact downloads
- `OPENAI_API_KEY` -> optional embeddings/RAG provider key
- `EMBEDDING_MODEL` -> derived evidence embedding model
- `LATEX_COMPILER` -> optional `tectonic` or `pdflatex` executable
- `LATEX_TIMEOUT_SECONDS` -> compiler timeout
- `ALLOW_RENDERER_FALLBACK` -> allow deterministic FPDF fallback locally

The `resumes` table is owned by the Drizzle schema in
`packages/database/src/schema/resume.ts`. Apply migrations with
`bun run db:migrate` (or `db:push` for local dev) before starting
the service.

## Run

```bash
bun run dev:resume-agent          # turbo serve, port 8005
bun run resume-agent:sync        # uv sync --extra dev
bun run test:resume-agent        # pytest suite
```

Interactive docs: http://127.0.0.1:8005/docs
