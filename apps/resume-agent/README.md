# resume-agent

`resume-agent` is the Python FastAPI service that ingests a user's resume
(PDF/DOCX), extracts structured data via Claude, stores it in Postgres, and
matches it against current job listings.

## What it does

The service exposes three flows:

- `POST /parse` uploads a resume file, extracts text, runs Claude to produce a
  structured `ResumeRecord`, and persists it.
- `GET /resume/{id}` retrieves a previously parsed resume.
- `GET /resume/{id}/match` calls `job-agent /search` with the extracted
  preferred role and re-ranks the results by skill overlap.

## How extraction works

1. `services/parser.py` turns the uploaded bytes into raw text:
   - PDF -> `pdfplumber` (page text + flattened tables)
   - DOCX -> `python-docx` (paragraphs + table cells)
2. `services/extractor.py` sends the text to Claude
   (`claude-sonnet-4-6`) with the system prompt in
   `services/prompts/resume_extract.txt` and parses the JSON reply into a
   validated `ResumeRecord`.
3. `services/db.py` writes/reads the `resumes` table via `asyncpg`.
4. `services/matcher.py` posts the preferred role to `job-agent /search` and
   ranks each result by the fraction of resume skills found in the job title.

## Request flow

1. A request comes into `routes/resume.py`.
2. The route reads shared state (`dependencies.AppState`) from
   `request.app.state.app_state`.
3. `parser` -> `extractor` -> `repository` (parse flow), or
   `repository` -> `matcher` (match flow).
4. The API returns a `ParseResponse` or `MatchResponse`.

## API endpoints

### Health

- `GET /` -> service status
- `GET /health` -> health check

### Parse

- `POST /parse` (multipart/form-data)

Form fields:

- `file` -> PDF or DOCX resume
- `user_id` -> string

Returns a `ParseResponse` with `resume_id`, contact details, skills,
education, work history, inferred `preferred_role` / `preferred_locations`,
and the original `raw_text`.

### Retrieve

- `GET /resume/{resume_id}` -> `ParseResponse`

### Match

- `GET /resume/{resume_id}/match?max_companies=10&max_jobs=50`

Returns a `MatchResponse` with ranked `MatchedJob` entries, each carrying
`match_score` and `matching_skills`.

## Local config

The app reads environment values from `apps/resume-agent/.env`. Copy
`.env.example` and fill in:

- `ANTHROPIC_API_KEY` -> Claude API key
- `DATABASE_URL` -> Postgres connection string
- `JOB_AGENT_URL` -> base URL of the job-agent service (default `http://127.0.0.1:8002`)

The `resumes` table is owned by the Drizzle schema in
`packages/database/src/schema/resume.ts`. Apply migrations with
`bun nx run @org/database:migrate` (or `push` for local dev) before starting
the service.

## Run

```bash
bun run dev:resume-agent          # nx serve, port 8005
bun run resume-agent:sync        # uv sync --extra dev
bun run test:resume-agent        # pytest suite
```

Interactive docs: http://127.0.0.1:8005/docs
