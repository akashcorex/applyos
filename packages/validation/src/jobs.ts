import * as z from 'zod';

import { httpUrlSchema, nonEmptyString, optionalHttpUrl } from './primitives';

/**
 * Job discovery + apply boundary.
 *
 * These mirror the Pydantic models in `apps/job-agent/models.py`
 * (`ScrapeRequest`, `DetectRequest`, `SearchRequest`,
 * `FundingScrapeRequest`) so the Next.js proxy routes
 * (`apps/web/src/app/api/jobs/*`) reject malformed payloads with a 400
 * BEFORE proxying to Python. Bounds are kept identical to the Python
 * side; if you change one, change the other.
 */

export const atsTypes = [
  'greenhouse',
  'lever',
  'ashby',
  'workable',
  'recruitee',
  'personio',
  'wellfound',
  'generic',
] as const;

export const atsTypeSchema = z.enum(atsTypes);
export type AtsType = (typeof atsTypes)[number];

/** Must match `ATS_SLUG_PATTERN` in `apps/job-agent/models.py`. */
export const atsSlugSchema = z
  .string({ error: 'ats_slug is required' })
  .min(1, { error: 'ats_slug is required' })
  .max(64, { error: 'ats_slug must be at most 64 characters' })
  .refine((value) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value), {
    error:
      'ats_slug must start with an alphanumeric character and contain only letters, numbers, dots, underscores, or hyphens',
  });

/** POST /api/jobs/ingest → job-agent `/ingest/:atsType`. */
export const jobIngestSchema = z.object({
  atsType: atsTypeSchema,
  atsSlug: atsSlugSchema,
  companyName: atsSlugSchema.optional(),
});

export type JobIngest = z.input<typeof jobIngestSchema>;

/** POST /api/jobs/detect → job-agent `/detect`. */
export const jobDetectSchema = z.object({
  careerPageUrl: httpUrlSchema,
});

export type JobDetect = z.input<typeof jobDetectSchema>;

/** POST /api/jobs/search → job-agent `/search` (mirrors SearchRequest). */
export const jobSearchSchema = z.object({
  job_title: nonEmptyString(128, 'job_title'),
  max_companies: z.number().int().min(1).max(40).default(15).prefault(15),
  max_jobs_per_company: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .prefault(50),
  experience_years: z.number().int().min(0).default(0).prefault(0),
});

export type JobSearch = z.input<typeof jobSearchSchema>;

/** Funding discovery (mirrors FundingScrapeRequest). */
export const fundingSources = [
  'startups_gallery',
  'techcrunch',
  'yc_recent',
] as const;

export const fundingRounds = [
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-d',
  'series-e',
  'venture',
  'unknown',
] as const;

export const fundingScrapeSchema = z.object({
  sources: z.array(z.enum(fundingSources)).optional(),
  limit: z.number().int().min(1).max(200).default(50).prefault(50),
  min_round: z.enum(fundingRounds).optional(),
  since_date: z.iso.date().optional(),
  enrich_domains: z.boolean().default(false).prefault(false),
});

export type FundingScrape = z.input<typeof fundingScrapeSchema>;

/**
 * POST /api/jobs/apply — single-job apply (mirrors the body destructured
 * in `apps/web/src/app/api/jobs/apply/route.ts`).
 */
export const jobApplySchema = z.object({
  company_name: nonEmptyString(512, 'company_name').optional(),
  ats_type: atsTypeSchema.optional(),
  ats_slug: atsSlugSchema.optional(),
  job_title: z.string().max(512).optional(),
  application_url: httpUrlSchema,
  external_id: nonEmptyString(512, 'external_id').optional(),
  department: z.string().max(256).optional(),
  location: z.string().max(256).optional(),
  description_raw: z.string().max(100_000).optional(),
  resume_id: nonEmptyString(256, 'resume_id'),
  resume_variant_id: nonEmptyString(256, 'resume_variant_id').optional(),
  dedup_key: nonEmptyString(1024, 'dedup_key').optional(),
  linkedin_url: optionalHttpUrl('linkedin_url'),
  github_url: optionalHttpUrl('github_url'),
  portfolio_url: optionalHttpUrl('portfolio_url'),
  twitter_url: optionalHttpUrl('twitter_url'),
  website_url: optionalHttpUrl('website_url'),
  current_company: z.string().max(512).optional(),
});

export type JobApply = z.input<typeof jobApplySchema>;

export const compiledJobIngestSchema = z.compile(jobIngestSchema);
export const compiledJobSearchSchema = z.compile(jobSearchSchema);
export const compiledJobApplySchema = z.compile(jobApplySchema);
