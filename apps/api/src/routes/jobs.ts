import { createHash } from 'node:crypto';

import { Router } from 'express';

import {
  jobDiscoverSchema,
  jobInteractionSchema,
  jobListQuerySchema,
  jobSelectSchema,
  notEvaluatedScoreResult,
} from '@applyso/validation';
import type { ScoreResult } from '@applyso/validation';
import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';
import { fetchJobDescription } from '../lib/job-description';
import { reconcileJobs } from '../lib/job-reconcile';
import { storedScoreResult } from '../lib/score-result';
import { requireServiceToken } from '../lib/service-token';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

/** Railway process shared memory for background discovery errors (single-instance). */
const globalScope = globalThis as typeof globalThis & {
  __discoveryRuns?: Map<string, { controller?: AbortController }>;
};
globalScope.__discoveryRuns ??= new Map();

type MatchJob = {
  dedup_key?: string | null;
  external_id?: string | null;
  source?: string | null;
  ats_type?: string | null;
  company_name?: string | null;
  title?: string | null;
  location?: string | null;
  location_type?: string | null;
  seniority?: string | null;
  application_url?: string | null;
  description?: string | null;
  description_raw?: string | null;
  raw_payload?: unknown;
  match_score?: number | null;
  reason?: string | null;
  score_result?: unknown;
  scoreResult?: unknown;
};

type StoredScore = {
  jobId?: string;
  dedupKey?: string;
  score?: number;
  reason?: string;
  scoreResult?: ScoreResult;
};

function asStoredScore(value: unknown): StoredScore | null {
  if (!value || typeof value !== 'object') return null;
  return value as StoredScore;
}

const SCORE_SESSION_LOOKBACK = 20;

type MatchResponse = {
  session_id?: string | null;
  jobs_scraped?: number;
  companies_scraped?: number;
  total_matches?: number;
  jobs?: MatchJob[];
};

function errorMessage(result: {
  error: { issues: { message: string }[] };
}): string {
  return result.error.issues[0]?.message ?? 'Invalid request';
}

function queryValue(value: unknown): string | undefined {
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === 'string' ? item : undefined;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\bsr\.?\s*/g, 'senior ')
    .replace(/\bjr\.?\s*/g, 'junior ')
    .replace(/\bswe\b/g, 'software engineer')
    .replace(/\bpm\b/g, 'product manager')
    .replace(/\beng\b/g, 'engineer')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLocation(location: string): string {
  const normalized = location
    .toLowerCase()
    .trim()
    .replace(/,\s*(usa|us|united states|uk|canada)$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || 'unknown';
}

function descriptionHash(description: string | null): string | null {
  if (!description) return null;
  const normalized = description
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/[^\w\s+#./-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000);
  return normalized
    ? createHash('sha256').update(normalized).digest('hex').slice(0, 32)
    : null;
}

async function confirmedProfile(userId: string) {
  return prisma.profile.findFirst({
    where: { userId, isConfirmed: true },
    include: {
      sourceResumeFile: {
        include: { resume: true },
      },
    },
  });
}

async function profileResume(
  userId: string,
  profile: Awaited<ReturnType<typeof confirmedProfile>>,
) {
  const resume = profile?.sourceResumeFile?.resume ?? null;
  if (resume) return resume;

  const latest = await prisma.resumeFile.findFirst({
    where: {
      userId,
      status: 'COMPLETED',
      deletedAt: null,
      resumeId: { not: null },
    },
    include: { resume: true },
    orderBy: { createdAt: 'desc' },
  });
  return latest?.resume ?? null;
}

function savedJobResponse(
  job: {
    id: string;
    dedupKey: string;
    source: string;
    externalId: string | null;
    companyName: string;
    title: string;
    titleNormalized: string;
    location: string;
    locationNormalized: string;
    locationType: string | null;
    seniority: string | null;
    descriptionRaw: string | null;
    applicationUrl: string | null;
    postedAt: Date | null;
    firstSeenAt: Date;
    lastSeenAt: Date;
    isActive: boolean;
  },
  isSaved: boolean,
  scoreResult: ScoreResult = notEvaluatedScoreResult(),
) {
  const ageDays = Math.max(
    0,
    Math.floor(
      (Date.now() - new Date(job.firstSeenAt).getTime()) / (24 * 3600 * 1000),
    ),
  );
  const flags: string[] = [];
  if (!job.descriptionRaw?.trim()) flags.push('no_description');
  if (ageDays > 90) flags.push('evergreen');
  return {
    id: job.id,
    dedupKey: job.dedupKey,
    source: job.source,
    externalId: job.externalId,
    companyName: job.companyName,
    title: job.title,
    titleNormalized: job.titleNormalized,
    location: job.location,
    locationNormalized: job.locationNormalized,
    locationType: job.locationType,
    seniority: job.seniority,
    descriptionRaw: job.descriptionRaw,
    applicationUrl: job.applicationUrl,
    postedAt: job.postedAt,
    firstSeenAt: job.firstSeenAt,
    lastSeenAt: job.lastSeenAt,
    ageDays,
    isNew: ageDays <= 7,
    flags,
    isActive: job.isActive,
    isSaved,
    score: scoreResult.score,
    scoreResult,
  };
}

/** Latest stored score per job id and dedup key, newest session first. */
async function latestStoredScores(
  userId: string,
): Promise<Map<string, ScoreResult>> {
  const sessions = await prisma.matchSession.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: SCORE_SESSION_LOOKBACK,
    select: { topResults: true },
  });
  const scores = new Map<string, ScoreResult>();
  for (const session of sessions) {
    if (!Array.isArray(session.topResults)) continue;
    for (const raw of session.topResults) {
      const item = asStoredScore(raw);
      if (!item) continue;
      const result = storedScoreResult(
        item.scoreResult,
        item.score,
        item.reason,
      );
      if (item.jobId && !scores.has(item.jobId)) {
        scores.set(item.jobId, result);
      }
      if (item.dedupKey) {
        const key = `dedup:${item.dedupKey}`;
        if (!scores.has(key)) scores.set(key, result);
      }
    }
  }
  return scores;
}

function scoreForJob(
  scores: Map<string, ScoreResult>,
  job: { id: string; dedupKey: string },
): ScoreResult | undefined {
  return scores.get(job.id) ?? scores.get(`dedup:${job.dedupKey}`);
}

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

export const jobsInternalRouter = Router();
jobsInternalRouter.post(
  '/internal/reconcile',
  requireServiceToken,
  async (req, res) => {
    try {
      const result = await reconcileJobs();
      res.status(200).json(result);
    } catch (error) {
      console.error('[jobs] reconcile failed:', error);
      res.status(502).json({ error: 'Job reconciler is unavailable' });
    }
  },
);

jobsRouter.post('/discover', async (req, res) => {
  const parsed = jobDiscoverSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }

  try {
    const me = authUserOf(req);
    const profile = await prisma.profile.findFirst({
      where: { id: parsed.data.profileId, userId: me.id, isConfirmed: true },
      include: { sourceResumeFile: { include: { resume: true } } },
    });
    if (!profile) {
      res.status(403).json({ error: 'A confirmed profile is required' });
      return;
    }

    const resume = await profileResume(me.id, profile);
    if (!resume) {
      res.status(409).json({ error: 'A completed resume is required' });
      return;
    }

    const role =
      parsed.data.query?.trim() ||
      profile.preferredRoles[0] ||
      resume.preferredRole ||
      'Software Engineer';

    const session = await prisma.matchSession.create({
      data: {
        userId: me.id,
        resumeId: resume.id,
        queryRole: role,
        discoveryStatus: 'pending',
        topResults: [] as never,
      },
    });
    res.status(202).json({ sessionId: session.id, status: 'pending' });
    void startDiscovery({
      sessionId: session.id,
      userId: me.id,
      resumeId: resume.id,
      role,
      limit: parsed.data.limit,
      pack: parsed.data.pack?.trim() || undefined,
      seniority: profile.seniority ?? '',
      workMode: profile.workMode ?? '',
      skills: profile.skills,
      locations: profile.preferredLocations,
      experienceYears:
        profile.totalExperienceYears ?? resume.experienceYears ?? 0,
    });
  } catch (error) {
    console.error('[jobs] discover failed:', error);
    res.status(500).json({
      error:
        'Job discovery failed. Run prisma migrate deploy against the API database and try again.',
    });
  }
});

type DiscoveryRequest = {
  sessionId: string;
  userId: string;
  resumeId: string;
  role: string;
  limit: number;
  pack?: string;
  seniority: string;
  workMode: string;
  skills: string[];
  locations: string[];
  experienceYears: number;
};

function discoveryRequestQuery(request: DiscoveryRequest): string {
  const query = new URLSearchParams({
    max_companies: '15',
    max_jobs: String(request.limit),
    profile_role: request.role,
    profile_experience_years: String(request.experienceYears),
    profile_skills: request.skills.join(','),
    profile_locations: request.locations.join(','),
    profile_seniority: request.seniority,
    profile_work_mode: request.workMode,
  });
  if (request.pack?.trim()) query.set('pack', request.pack.trim());
  return query.toString();
}

export async function startDiscovery(request: DiscoveryRequest) {
  const runs = globalScope.__discoveryRuns!;
  const existing = runs.get(request.sessionId);
  if (existing) {
    existing.controller?.abort();
  }
  const controller = new AbortController();
  runs.set(request.sessionId, { controller });
  const startedAt = Date.now();
  const query = discoveryRequestQuery({
    ...request,
    limit: Math.max(1, Math.min(request.limit, 15)),
  });
  try {
    const response = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(request.resumeId)}/match?${query}`,
      {
        headers: { 'X-User-Id': request.userId },
        signal: controller.signal,
      },
    );
    const data = (await response.json().catch(() => null)) as
      (MatchResponse & { detail?: string; error?: string }) | null;
    if (!response.ok) {
      throw new Error(
        data?.error ??
          data?.detail ??
          `Resume matching failed (HTTP ${response.status})`,
      );
    }
    const latencyMs = Date.now() - startedAt;
    await persistDiscoveryMatches(request, latencyMs, data);
    runs.delete(request.sessionId);
  } catch (error) {
    const message = errorText(error, 'Unknown discovery error');
    console.error(
      `[jobs] discovery ${request.sessionId} failed:`,
      error instanceof Error ? error.stack : message,
    );
    runs.delete(request.sessionId);
    try {
      await prisma.matchSession.update({
        where: { id: request.sessionId },
        data: {
          discoveryStatus: 'failed',
          discoveryError: message.slice(0, 500),
          latencyMs: Date.now() - startedAt,
        },
      });
    } catch (persistError) {
      console.error('[jobs] discovery failure record failed:', persistError);
    }
  }
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'Resume matching timed out';
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'Discovery was superseded by a newer request';
  }
  return error instanceof Error ? error.message : fallback;
}

async function persistDiscoveryMatches(
  request: DiscoveryRequest,
  latencyMs: number,
  data: MatchResponse | null,
) {
  const matchJobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const persisted = await prisma
    .$transaction(
      async (tx) => {
        const jobs: {
          id: string;
          score: number;
          reason: string;
          dedupKey: string;
          scoreResult: ScoreResult;
        }[] = [];

        for (const item of matchJobs) {
          const dedupKey = item.dedup_key?.trim();
          const title = item.title?.trim();
          const companyName = item.company_name?.trim();
          if (!dedupKey || !title || !companyName) continue;
          const description = item.description_raw ?? item.description ?? null;
          const location = item.location?.trim() ?? '';
          const source = item.source ?? item.ats_type ?? 'generic';
          const job = await tx.job.upsert({
            where: { dedupKey },
            create: {
              dedupKey,
              source,
              externalId: item.external_id ?? null,
              companyName,
              title,
              titleNormalized: normalizeTitle(title),
              location,
              locationNormalized: normalizeLocation(location),
              locationType: item.location_type ?? null,
              seniority: item.seniority ?? null,
              descriptionRaw: description,
              descriptionHash: descriptionHash(description),
              applicationUrl: item.application_url ?? null,
              firstSeenAt: new Date(),
              lastSeenAt: new Date(),
              rawPayload: (item.raw_payload ?? {}) as never,
              isActive: true,
            },
            update: {
              source,
              externalId: item.external_id ?? null,
              companyName,
              title,
              titleNormalized: normalizeTitle(title),
              location,
              locationNormalized: normalizeLocation(location),
              locationType: item.location_type ?? null,
              seniority: item.seniority ?? null,
              descriptionRaw: description,
              descriptionHash: descriptionHash(description),
              applicationUrl: item.application_url ?? null,
              lastSeenAt: new Date(),
              rawPayload: (item.raw_payload ?? {}) as never,
              isActive: true,
            },
          });

          await tx.company.upsert({
            where: { name: companyName },
            create: {
              name: companyName,
              atsType: item.ats_type ?? null,
              atsSlug: null,
            },
            update: {
              atsType: item.ats_type ?? undefined,
            },
          });

          const scoreResult = storedScoreResult(
            item.score_result ?? item.scoreResult,
            item.match_score,
            item.reason,
            item.dedup_key ?? undefined,
          );
          jobs.push({
            id: job.id,
            score: scoreResult.score,
            reason:
              item.reason?.trim() ||
              scoreResult.reason ||
              'Recommended from your confirmed profile.',
            dedupKey: job.dedupKey,
            scoreResult,
          });
        }

        const topResults = jobs.map((job, index) => ({
          jobId: job.id,
          dedupKey: job.dedupKey,
          score: job.score,
          reason: job.reason,
          scoreResult: job.scoreResult,
          rank: index + 1,
        }));
        const persistedSession = await tx.matchSession.update({
          where: { id: request.sessionId },
          data: {
            topResults: topResults as never,
            latencyMs,
            discoveryStatus: 'complete',
            discoveryError: null,
            jobsScraped: data?.jobs_scraped ?? jobs.length,
            jobsReturned: jobs.length,
            companiesScraped: data?.companies_scraped ?? 0,
          },
        });
        return { sessionId: persistedSession.id, jobs };
      },
      { maxWait: 10000, timeout: 30000 },
    )
    .catch((error) => {
      console.error('[jobs] discovery persistence failed:', error);
      return null;
    });
  if (!persisted) {
    throw new Error('Job results could not be saved');
  }
}

jobsRouter.get('/discover/:id', async (req, res) => {
  const parsed = jobListQuerySchema.safeParse({
    limit: queryValue(req.query.limit),
    offset: queryValue(req.query.offset),
  });
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }

  try {
    const me = authUserOf(req);
    const profile = await confirmedProfile(me.id);
    if (!profile) {
      res.status(403).json({ error: 'A confirmed profile is required' });
      return;
    }

    const session = await prisma.matchSession.findFirst({
      where: { id: req.params.id, userId: me.id },
      select: { topResults: true, discoveryStatus: true, discoveryError: true },
    });
    if (!session) {
      res.status(404).json({ error: 'Match session not found' });
      return;
    }

    const topResults: (StoredScore & { jobId: string; dedupKey: string })[] =
      [];
    if (Array.isArray(session.topResults)) {
      for (const raw of session.topResults) {
        const item = asStoredScore(raw);
        if (item?.jobId && item.dedupKey) {
          topResults.push({
            ...item,
            jobId: item.jobId,
            dedupKey: item.dedupKey,
          });
        }
      }
    }
    const limit = Math.min(parsed.data.limit, 20);
    const page = topResults.slice(
      parsed.data.offset,
      parsed.data.offset + limit,
    );
    const jobs = await prisma.job.findMany({
      where: { id: { in: page.map((item) => item.jobId) } },
    });
    const jobsById = new Map(jobs.map((job) => [job.id, job]));
    const saved = await prisma.savedJob.findMany({
      where: {
        userId: me.id,
        jobId: { in: page.map((item) => item.jobId) },
      },
      select: { jobId: true },
    });
    const savedIds = new Set(saved.map((item) => item.jobId));

    res.status(200).json({
      jobs: page.flatMap((item) => {
        const job = jobsById.get(item.jobId);
        const scoreResult = storedScoreResult(
          item.scoreResult,
          item.score,
          item.reason,
        );
        return job
          ? [
              {
                ...savedJobResponse(job, savedIds.has(job.id), scoreResult),
                reason: item.reason ?? scoreResult.reason,
              },
            ]
          : [];
      }),
      totalJobs: topResults.length,
      hasMore: parsed.data.offset + page.length < topResults.length,
      offset: parsed.data.offset,
      limit,
      status: session.discoveryStatus,
      error: session.discoveryError ?? null,
    });
  } catch (error) {
    console.error('[jobs] discover session failed:', error);
    res.status(500).json({ error: 'Could not load discovery results' });
  }
});

/** Jobs first seen within this window count as fresh for the "new" feed. */
const FRESH_JOB_DAYS = 7;

jobsRouter.get('/', async (req, res) => {
  const parsed = jobListQuerySchema.safeParse({
    saved: queryValue(req.query.saved),
    fresh: queryValue(req.query.fresh),
    q: queryValue(req.query.q),
    limit: queryValue(req.query.limit),
    offset: queryValue(req.query.offset),
  });
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }

  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }

  const freshSince =
    parsed.data.fresh === 'true'
      ? new Date(Date.now() - FRESH_JOB_DAYS * 24 * 3600 * 1000)
      : null;
  const savedFilter =
    parsed.data.saved === 'true'
      ? { some: { userId: me.id } }
      : parsed.data.saved === 'false'
        ? { none: { userId: me.id } }
        : undefined;
  const jobs = await prisma.job.findMany({
    where: {
      isActive: true,
      ...(freshSince ? { firstSeenAt: { gte: freshSince } } : {}),
      ...(parsed.data.q
        ? {
            OR: [
              { title: { contains: parsed.data.q, mode: 'insensitive' } },
              { companyName: { contains: parsed.data.q, mode: 'insensitive' } },
              { location: { contains: parsed.data.q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(savedFilter ? { savedBy: savedFilter } : {}),
    },
    orderBy: freshSince ? { firstSeenAt: 'desc' } : { lastSeenAt: 'desc' },
    take: parsed.data.limit,
    skip: parsed.data.offset,
  });
  const scoreMap = await latestStoredScores(me.id);
  const saved = await prisma.savedJob.findMany({
    where: { userId: me.id, jobId: { in: jobs.map((job) => job.id) } },
    select: { jobId: true },
  });
  const savedIds = new Set(saved.map((item) => item.jobId));
  res.status(200).json({
    jobs: jobs.map((job) =>
      savedJobResponse(job, savedIds.has(job.id), scoreForJob(scoreMap, job)),
    ),
    ...(freshSince ? { seenAt: profile.jobsSeenAt ?? null } : {}),
  });
});

jobsRouter.post('/seen', async (req, res) => {
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const seenAt = new Date();
  await prisma.profile.update({
    where: { id: profile.id },
    data: { jobsSeenAt: seenAt },
  });
  res.status(200).json({ seenAt });
});

jobsRouter.get('/selections/:id', async (req, res) => {
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const selection = await prisma.jobSelection.findFirst({
    where: { id: req.params.id, userId: me.id },
    include: {
      items: {
        orderBy: { rankPosition: 'asc' },
        include: { job: true },
      },
    },
  });
  if (!selection) {
    res.status(404).json({ error: 'Selection not found' });
    return;
  }
  const saved = await prisma.savedJob.findMany({
    where: {
      userId: me.id,
      jobId: { in: selection.items.map((item) => item.jobId) },
    },
    select: { jobId: true },
  });
  const savedIds = new Set(saved.map((item) => item.jobId));
  const scoreMap = await latestStoredScores(me.id);
  res.status(200).json({
    selectionId: selection.id,
    jobIds: selection.items.map((item) => item.jobId),
    jobs: selection.items.map((item) => {
      const scoreResult =
        scoreForJob(scoreMap, item.job) ??
        storedScoreResult(undefined, item.score);
      return {
        ...savedJobResponse(item.job, savedIds.has(item.jobId), scoreResult),
        rankPosition: item.rankPosition,
      };
    }),
    createdAt: selection.createdAt,
  });
});

jobsRouter.get('/:id/description', async (req, res) => {
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  if (job.descriptionRaw?.trim()) {
    res.status(200).json({ description: job.descriptionRaw, cached: true });
    return;
  }
  if (!job.applicationUrl) {
    res.status(200).json({ description: null, cached: false });
    return;
  }
  try {
    const { description, confident } = await fetchJobDescription(
      job.id,
      job.applicationUrl,
    );
    if (!description) {
      res.status(200).json({ description: null, cached: false });
      return;
    }
    if (confident) {
      await prisma.job.update({
        where: { id: job.id },
        data: { descriptionRaw: description },
      });
    }
    res.status(200).json({ description, cached: false });
  } catch (error) {
    console.error('[jobs] description fetch failed:', error);
    res.status(502).json({ error: 'Could not read the job description' });
  }
});

jobsRouter.post('/:id/interactions', async (req, res) => {
  const parsed = jobInteractionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const session = await prisma.matchSession.findFirst({
    where: { id: parsed.data.sessionId, userId: me.id },
  });
  if (!session) {
    res.status(404).json({ error: 'Match session not found' });
    return;
  }
  const topResults = Array.isArray(session.topResults)
    ? session.topResults
    : [];
  const belongsToSession = topResults.some((result) => {
    if (!result || typeof result !== 'object') return false;
    const item = result as { jobId?: unknown; dedupKey?: unknown };
    return item.jobId === job.id || item.dedupKey === job.dedupKey;
  });
  if (!belongsToSession) {
    res.status(409).json({ error: 'Job is not part of this match session' });
    return;
  }
  const interaction = await prisma.matchInteraction.create({
    data: {
      sessionId: session.id,
      userId: me.id,
      resumeId: session.resumeId,
      dedupKey: job.dedupKey,
      jobTitle: job.title,
      companyName: job.companyName,
      eventType: parsed.data.eventType,
      rankPosition: parsed.data.rankPosition,
      matchScore: parsed.data.matchScore,
    },
  });
  res.status(201).json({ interactionId: interaction.id });
});

jobsRouter.put('/:id/save', async (req, res) => {
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const job = await prisma.job.findUnique({ where: { id: req.params.id } });
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  const saved = await prisma.savedJob.upsert({
    where: { userId_jobId: { userId: me.id, jobId: job.id } },
    create: { userId: me.id, jobId: job.id },
    update: {},
  });
  res.status(200).json({ saved: true, savedJobId: saved.id, jobId: job.id });
});

jobsRouter.delete('/:id/save', async (req, res) => {
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  await prisma.savedJob.deleteMany({
    where: { userId: me.id, jobId: req.params.id },
  });
  res.status(200).json({ saved: false, jobId: req.params.id });
});

jobsRouter.post('/:id/select', async (req, res) => {
  const parsed = jobSelectSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }
  const me = authUserOf(req);
  const profile = await confirmedProfile(me.id);
  if (!profile) {
    res.status(403).json({ error: 'A confirmed profile is required' });
    return;
  }
  const uniqueIds = [...new Set(parsed.data.jobIds)];
  if (uniqueIds.length !== parsed.data.jobIds.length) {
    res.status(400).json({ error: 'Each selected job must be unique' });
    return;
  }
  if (!uniqueIds.includes(req.params.id)) {
    res
      .status(400)
      .json({ error: 'The selected job path does not match the selection' });
    return;
  }
  const jobs = await prisma.job.findMany({
    where: { id: { in: uniqueIds }, isActive: true },
  });
  if (jobs.length !== uniqueIds.length) {
    res.status(404).json({ error: 'One or more selected jobs were not found' });
    return;
  }
  const jobsById = new Map(jobs.map((job) => [job.id, job]));
  const selection = await prisma.$transaction(async (tx) => {
    const created = await tx.jobSelection.create({
      data: { userId: me.id },
    });
    await tx.jobSelectionItem.createMany({
      data: uniqueIds.map((jobId, index) => ({
        selectionId: created.id,
        jobId,
        rankPosition: index,
        score: parsed.data.scores?.[jobId] ?? null,
      })),
    });
    return created;
  });
  res.status(201).json({
    selectionId: selection.id,
    jobIds: uniqueIds,
    jobs: uniqueIds.map((jobId) =>
      savedJobResponse(
        jobsById.get(jobId)!,
        false,
        storedScoreResult(undefined, parsed.data.scores?.[jobId]),
      ),
    ),
  });
});
