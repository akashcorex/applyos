# job-agent

`job-agent` is the Python FastAPI service that discovers and normalizes jobs from public ATS pages.

## What it does

The service exposes two main flows:

- `POST /detect` inspects a public careers page URL and tries to identify the ATS provider.
- `POST /ingest/{ats}` fetches jobs from a supported ATS and converts them into a canonical job shape.

Supported ATS types:

- Greenhouse
- Lever
- Ashby
- Workable
- Recruitee
- Personio

## How the scraping works

This service does not use browser automation. It calls the ATS's public job APIs or XML feeds directly:

- Greenhouse -> JSON API at `https://api.greenhouse.io/v1/boards/{slug}/jobs`
- Lever -> JSON API at `https://api.lever.co/v0/postings/{slug}?mode=json`
- Ashby -> JSON API at `https://api.ashbyhq.com/posting-api/job-board/{slug}`
- Workable -> JSON API at `https://apply.workable.com/api/v3/accounts/{slug}/jobs`
- Recruitee -> JSON API at `https://{slug}.recruitee.com/api/offers`
- Personio -> XML feed at `https://{slug}.jobs.personio.de/xml`

Each parser maps the raw ATS payload into `RawJob`, then `services/normalizer.py` converts that into a canonical job record:

- normalizes titles and locations
- infers location type when possible
- detects seniority
- flags equity mentions
- builds a dedup key so duplicate jobs can be removed within the same scrape

## Request flow

1. A request comes into `routes/detect.py` or `routes/ingest.py`.
2. The route calls a service function in `services/ats_detect.py` or `services/ingest.py`.
3. The service fetches the public ATS endpoint.
4. The parser converts raw data into `RawJob` objects.
5. The normalizer converts jobs into `CanonicalJob` objects.
6. Duplicate jobs are removed using the dedup key.
7. The API returns a `ScrapeResponse`.

## API endpoints

### Health

- `GET /` -> service status
- `GET /health` -> health check

### Detect

- `POST /detect`

Example body:

```json
{
  "career_page_url": "https://boards.greenhouse.io/stripe"
}
```

Example response fields:

- `ats_type`
- `suggested_slug`
- `confidence`
- `career_page_url`

### Ingest

- `POST /ingest/greenhouse`
- `POST /ingest/lever`
- `POST /ingest/ashby`
- `POST /ingest/workable`
- `POST /ingest/recruitee`
- `POST /ingest/personio`

Example body:

```json
{
  "ats_slug": "stripe",
  "company_id": "stripe"
}
```

If `company_id` is omitted, the service uses `ats_slug` as the namespace for dedup keys.

## Local config

The app reads environment values from `apps/job-agent/.env`.

Available settings:

- `HOST` default `127.0.0.1`
- `PORT` default `8002`
- `HTTP_TIMEOUT_SECONDS` default `10`
- `HTTP_MAX_RETRIES` default `3`

See `.env.example` for the full list.

## Run locally

From the repository root:

```bash
bun nx run job-agent:serve
```

Or from the app directory:

```bash
cd apps/job-agent
uv run uvicorn main:app --reload --host 127.0.0.1 --port 8002
```

The service will be available at `http://127.0.0.1:8002`.

## Test locally

From the repository root:

```bash
bun nx run job-agent:test
```

Or from the app directory:

```bash
cd apps/job-agent
uv run pytest -q
```

Current test status: `18 passed`.

## Implementation notes

- `services/parsers/base.py` contains shared HTTP fetching with retries and backoff.
- `services/parsers/yc.py` fetches YC's public company registry and normalizes company metadata for seeding.
- `services/ats_detect.py` looks for ATS signatures in the careers page HTML and tries to infer the slug from the URL.
- `services/normalizer.py` is where title, location, seniority, location type, and equity detection happen.
- `services/dedup.py` builds the dedup key used to filter duplicates inside a single scrape.

## YC and funding data

The YC registry gives you company name, website, batch, and ATS overrides for some well-known companies.
It does not provide a reliable "recently funded" field.

If you need recent funding dates, round types, or investors, you will need a separate data source such as Crunchbase, Dealroom, Wellfound, Tracxn, or a company-owned press/news feed.
The YC batch is useful as a proxy for YC cohort recency, but it is not the same as external funding recency.

## Good next checks

- Hit `GET /health` after starting the service.
- Call `POST /detect` with a public careers page URL.
- Call one `POST /ingest/{ats}` route with a known slug and inspect the returned `jobs` array.
