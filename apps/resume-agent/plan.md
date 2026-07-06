# Plan: Resume Agent (`apps/resume-agent`)

## Purpose

A Python FastAPI microservice that ingests a user's resume (PDF/DOCX), extracts structured data via Claude, and stores it in Postgres. The parsed resume feeds into the existing job search and auto-apply pipeline — users upload once, then the platform matches them to jobs automatically.

## Architecture

```
User uploads resume (PDF/DOCX)
        │
        ▼
┌───────────────────┐
│   Resume Agent    │  FastAPI (port 8005)
│                   │
│  1. Parse file    │──► PDF: pdfplumber / PyPDF2
│  2. Extract text   │──► DOCX: python-docx
│  3. LLM structure  │──► Claude: skills, experience, education, etc.
│  4. Store           │──► Postgres via @org/database
│  5. Match jobs     │──► calls job-agent /search with extracted role + skills
└───────────────────┘
        │
        ▼
┌───────────────────┐
│   Existing flow   │
│                   │
│  Job Agent :8002  │  search by extracted role/skills
│  Orchestrator     │  workflow with CVData from resume
│  Apply Agent      │  auto-fill forms with extracted data
└───────────────────┘
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | FastAPI + Uvicorn |
| PDF parsing | `pdfplumber` (tables), `PyPDF2` (text) |
| DOCX parsing | `python-docx` |
| LLM | Anthropic Claude (`claude-sonnet-4-6`) |
| Validation | Pydantic v2 |
| HTTP | `httpx` |
| Settings | `pydantic-settings` |
| Deps | `uv` (like ai-orchestrator/job-agent) |

## File structure

```
apps/resume-agent/
├── main.py                  # FastAPI app, lifespan, router registration
├── config.py                # Settings (port 8005, API keys, URLs)
├── models.py                # Pydantic models
├── dependencies.py          # AppState (LLM client, DB client)
├── project.json             # Nx config (serve, sync targets)
├── pyproject.toml           # uv deps
├── requirements.txt         # pip deps
├── .env.example             # ANTHROPIC_API_KEY, DATABASE_URL, JOB_AGENT_URL
├── .env                     # actual keys (gitignored)
├── routes/
│   ├── __init__.py
│   ├── health.py            # GET /health
│   └── resume.py            # POST /parse, GET /resume/{id}, GET /resume/{id}/match
└── services/
    ├── __init__.py
    ├── parser.py            # PDF/DOCX → raw text
    ├── extractor.py         # Claude prompt → structured CVData
    └── matcher.py           # calls job-agent /search with extracted role + skills
```

## API endpoints

### `POST /parse`
Upload a resume file, extract structured data.

```
POST /parse
Content-Type: multipart/form-data
Body: file (PDF or DOCX), user_id (string)

Response 200:
{
  "resume_id": "uuid",
  "full_name": "Jane Doe",
  "email": "jane@example.com",
  "phone": "+1-555-0123",
  "location": "San Francisco, CA",
  "summary": "Full-stack engineer with 5 years...",
  "experience_years": 5,
  "skills": ["Python", "React", "TypeScript", "PostgreSQL", "AWS"],
  "education": [
    { "degree": "B.S. Computer Science", "school": "UC Berkeley", "year": 2019 }
  ],
  "work_history": [
    {
      "company": "Stripe",
      "title": "Senior Software Engineer",
      "start_date": "2022-01",
      "end_date": null,
      "highlights": ["Led checkout team...", "Migrated to microservices..."]
    }
  ],
  "preferred_role": "Senior Full Stack Engineer",
  "preferred_locations": ["San Francisco", "Remote"],
  "raw_text": "..."   # original extracted text for audit
}
```

### `GET /resume/{id}`
Retrieve a previously parsed resume.

### `GET /resume/{id}/match`
Match parsed resume against current job listings.

```
GET /resume/{id}/match?max_companies=10&max_jobs=50

Response 200:
{
  "resume_id": "uuid",
  "preferred_role": "Senior Full Stack Engineer",
  "skills_used": ["Python", "React", "TypeScript"],
  "total_matches": 42,
  "jobs": [
    {
      "title": "Senior Full Stack Engineer",
      "company_name": "Stripe",
      "match_score": 0.92,
      "matching_skills": ["Python", "React", "TypeScript"],
      ...
    }
  ]
}
```
This endpoint calls the job-agent `/search` with the extracted preferred_role, then re-ranks results by skill overlap.

### `GET /health`
Standard health check.

## LLM extraction flow

1. **Parse file** → raw text using pdfplumber/PyPDF2 or python-docx
2. **Chunk if needed** → if text > 100K chars, split into sections
3. **Claude prompt** → structured system prompt asking for:
   - Full name, email, phone, location
   - Years of experience (total)
   - Skills (list of strings)
   - Education (list of {degree, school, year})
   - Work history (list of {company, title, dates, highlights})
   - Professional summary
   - Inferred preferred role (based on most recent title + skills)
   - Inferred preferred location (based on current city + remote preference)
4. **Validate** → Pydantic model validation
5. **Store** → save to `resumes` table in Postgres

### Claude system prompt (sketch)

```
You are a resume parser. Extract the following fields from the resume text
and return valid JSON. Be precise — only extract what is explicitly stated.

Fields:
- full_name: string
- email: string
- phone: string or null
- location: string or null (city, state)
- summary: string or null (professional summary paragraph)
- experience_years: integer (total years of professional experience)
- skills: string[] (technical and soft skills, lowercase)
- education: {degree: string, school: string, year: integer}[]
- work_history: {company: string, title: string, start_date: string, end_date: string|null, highlights: string[]}[]
- preferred_role: string (infer from most recent job title + dominant skills)
- preferred_locations: string[] (infer from current location + remote mentions)

Return ONLY valid JSON, no other text.
```

## Database schema (Postgres, Drizzle)

```sql
CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES "user"(id),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  location TEXT,
  summary TEXT,
  experience_years INTEGER DEFAULT 0,
  skills TEXT[] DEFAULT '{}',
  education JSONB DEFAULT '[]',
  work_history JSONB DEFAULT '[]',
  preferred_role TEXT,
  preferred_locations TEXT[] DEFAULT '{}',
  raw_text TEXT,
  file_name TEXT,
  file_type TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_resumes_user_id ON resumes(user_id);
CREATE INDEX idx_resumes_skills ON resumes USING GIN(skills);
```

This lives in `packages/database/src/schema/resume.ts` alongside the auth schema.

## Integration with existing agents

| Direction | What | How |
|-----------|------|-----|
| resume-agent → job-agent | Match parsed resume to jobs | Resume agent calls `POST /search` on job-agent with `preferred_role` from parsed resume. Re-rank results by skill overlap. |
| resume-agent → api | Store resume in DB | Direct Postgres write via `@org/database` (or HTTP POST to API if we add a resume endpoint). |
| web → resume-agent | Upload resume from UI | Next.js API route proxies `POST /api/resume/parse` → `POST /parse` on resume-agent. |
| orchestrator → resume-agent | Get CVData for workflow | Orchestrator fetches parsed resume from DB or resume-agent to populate `CVData` in workflow payload. |
| apply-agent → resume | Auto-fill forms | Already uses orchestrated `CVData`. No changes needed — resume-agent feeds CVData upstream. |

## Web UI changes needed

1. **Resume upload page** (`/dashboard/resume`):
   - Drag-and-drop file upload (PDF/DOCX)
   - Shows parsed result: skills tags, experience timeline, education
   - "Search Matching Jobs" button → calls `/resume/{id}/match`
   - Shows matched jobs with "Apply" buttons (reuses existing apply flow)

2. **Auto-enrichment**: After upload, auto-trigger `/resume/{id}/match` and pre-fill the job discovery panel

## Nx project config

```json
{
  "name": "resume-agent",
  "$schema": "../../node_modules/nx/schemas/project-schema.json",
  "sourceRoot": "apps/resume-agent",
  "projectType": "application",
  "tags": ["type:app", "lang:python"],
  "targets": {
    "sync": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/resume-agent",
        "command": "uv sync --extra dev"
      }
    },
    "serve": {
      "continuous": true,
      "executor": "nx:run-commands",
      "dependsOn": ["sync"],
      "options": {
        "cwd": "apps/resume-agent",
        "command": "uv run uvicorn main:app --reload --host 127.0.0.1 --port 8005"
      }
    }
  }
}
```

Add `resume-agent` to root `package.json` dev scripts and `nx run-many -t dev -t serve` command.

## env vars

```
# apps/resume-agent/.env
HOST=127.0.0.1
PORT=8005
ANTHROPIC_API_KEY=sk-ant-xxx
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/outreach
JOB_AGENT_URL=http://127.0.0.1:8002
```

## Implementation order

| Phase | Step | Effort |
|-------|------|--------|
| 1 | Scaffold `apps/resume-agent` with FastAPI + health endpoint | 30 min |
| 2 | Add PDF/DOCX text extraction (`parser.py`) | 1 hr |
| 3 | Add Claude-based structured extraction (`extractor.py`) | 1.5 hr |
| 4 | Add `POST /parse` and `GET /resume/{id}` routes | 30 min |
| 5 | Add DB schema (`packages/database/src/schema/resume.ts`) | 20 min |
| 6 | Add `GET /resume/{id}/match` with job-agent integration | 1 hr |
| 7 | Web UI: resume upload page, results display, match button | 2 hr |
| 8 | Wire orchestrator to load CVData from parsed resume | 30 min |
| 9 | Tests | 1 hr |

**Total estimated: ~8 hours**

## Dependencies to add

```
# pyproject.toml / requirements.txt
fastapi>=0.115.0
uvicorn[standard]>=0.32.0
pydantic-settings>=2.0.0
httpx>=0.27.0
anthropic>=0.40.0
pdfplumber>=0.11.0
python-docx>=1.1.0
python-multipart>=0.0.18
```
