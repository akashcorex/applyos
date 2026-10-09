import * as z from 'zod';

import { httpUrlSchema, nonEmptyString, optionalHttpUrl } from './primitives';

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

export const jobDiscoverSchema = z.object({
  profileId: nonEmptyString(128, 'profileId'),
  query: nonEmptyString(128, 'query').optional(),
  limit: z.number().int().min(1).max(100).default(50).prefault(50),
  pack: z.string().trim().max(32).optional(),
});

export type JobDiscover = z.input<typeof jobDiscoverSchema>;

export const jobListQuerySchema = z.object({
  saved: z.enum(['true', 'false']).optional(),
  fresh: z.enum(['true']).optional(),
  q: z.string().trim().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50).prefault(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0).prefault(0),
});

export type JobListQuery = z.input<typeof jobListQuerySchema>;

export const jobSelectSchema = z.object({
  jobIds: z
    .array(nonEmptyString(128, 'jobIds'))
    .min(1, { error: 'Select at least one job' })
    .max(10, { error: 'Select no more than 10 jobs' }),
  scores: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export type JobSelect = z.input<typeof jobSelectSchema>;

export const jobInteractionSchema = z.object({
  sessionId: nonEmptyString(128, 'sessionId'),
  eventType: z.enum(['impression', 'click', 'skip']),
  rankPosition: z.number().int().min(0).max(10_000).optional(),
  matchScore: z.number().min(0).max(100).optional(),
});

export type JobInteraction = z.input<typeof jobInteractionSchema>;

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

export const compiledJobApplySchema = z.compile(jobApplySchema);
