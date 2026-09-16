import { createHash } from 'node:crypto';

import { Router } from 'express';

import {
  jobDiscoverSchema,
  jobInteractionSchema,
  jobListQuerySchema,
  jobSelectSchema,
} from '@applyso/validation';
import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';

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
};

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
) {
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
    isActive: job.isActive,
    isSaved,
  };
}

export const jobsRouter = Router();
jobsRouter.use(requireAuth);

jobsRouter.post('/discover', async (req, res) => {
  const parsed = jobDiscoverSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: errorMessage(parsed) });
    return;
  }

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
  const startedAt = Date.now();
  const query = new URLSearchParams({
    max_companies: '15',
    max_jobs: String(parsed.data.limit),
    profile_role: role,
    profile_experience_years: String(
      profile.totalExperienceYears ?? resume.experienceYears ?? 0,
    ),
    profile_skills: profile.skills.join(','),
    profile_locations: profile.preferredLocations.join(','),
    profile_seniority: profile.seniority ?? '',
    profile_work_mode: profile.workMode ?? '',
  });

  let response: Response;
  try {
    response = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(resume.id)}/match?${query}`,
      {
        headers: { 'X-User-Id': me.id },
        signal: AbortSignal.timeout(120000),
      },
    );
  } catch {
    res.status(502).json({ error: 'Resume matching service is unavailable' });
    return;
  }
  const data = (await response.json().catch(() => null)) as
    (MatchResponse & { detail?: string; error?: string }) | null;
  if (!response.ok) {
    res.status(502).json({
      error: data?.error ?? data?.detail ?? 'Resume matching failed',
    });
    return;
  }

  const matchJobs = Array.isArray(data?.jobs) ? data.jobs : [];
  const latencyMs = Date.now() - startedAt;
  const persisted = await prisma.$transaction(async (tx) => {
    const jobs: {
      id: string;
      score: number;
      reason: string;
      firstSeenAt: Date;
      lastSeenAt: Date;
      companyName: string;
      title: string;
      location: string;
      seniority: string | null;
      applicationUrl: string | null;
      dedupKey: string;
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

      jobs.push({
        id: job.id,
        score:
          typeof item.match_score === 'number' &&
          Number.isFinite(item.match_score)
            ? item.match_score
            : 0,
        reason:
          item.reason?.trim() || 'Recommended from your confirmed profile.',
        firstSeenAt: job.firstSeenAt,
        lastSeenAt: job.lastSeenAt,
        companyName: job.companyName,
        title: job.title,
        location: job.location,
        seniority: job.seniority,
        applicationUrl: job.applicationUrl,
        dedupKey: job.dedupKey,
      });
    }

    const topResults = jobs.map((job, index) => ({
      jobId: job.id,
      dedupKey: job.dedupKey,
      score: job.score,
      reason: job.reason,
      rank: index + 1,
    }));
    const sessionId = data?.session_id;
    const session = sessionId
      ? await tx.matchSession.findUnique({ where: { id: sessionId } })
      : null;
    const persistedSession = session
      ? await tx.matchSession.update({
          where: { id: session.id },
          data: { topResults: topResults as never, latencyMs },
        })
      : await tx.matchSession.create({
          data: {
            userId: me.id,
            resumeId: resume.id,
            queryRole: role,
            jobsScraped: data?.jobs_scraped ?? jobs.length,
            jobsReturned: jobs.length,
            companiesScraped: data?.companies_scraped ?? 0,
            latencyMs,
            topResults: topResults as never,
          },
        });

    return { sessionId: persistedSession.id, jobs };
  });

  const saved = await prisma.savedJob.findMany({
    where: {
      userId: me.id,
      jobId: { in: persisted.jobs.map((job) => job.id) },
    },
    select: { jobId: true },
  });
  const savedIds = new Set(saved.map((item) => item.jobId));
  res.status(200).json({
    sessionId: persisted.sessionId,
    jobs: persisted.jobs.map((job) => ({
      ...job,
      isSaved: savedIds.has(job.id),
    })),
    latencyMs,
  });
});

jobsRouter.get('/', async (req, res) => {
  const parsed = jobListQuerySchema.safeParse({
    saved: queryValue(req.query.saved),
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

  const savedFilter =
    parsed.data.saved === 'true'
      ? { some: { userId: me.id } }
      : parsed.data.saved === 'false'
        ? { none: { userId: me.id } }
        : undefined;
  const jobs = await prisma.job.findMany({
    where: {
      isActive: true,
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
    orderBy: { lastSeenAt: 'desc' },
    take: parsed.data.limit,
    skip: parsed.data.offset,
  });
  const saved = await prisma.savedJob.findMany({
    where: { userId: me.id, jobId: { in: jobs.map((job) => job.id) } },
    select: { jobId: true },
  });
  const savedIds = new Set(saved.map((item) => item.jobId));
  res.status(200).json({
    jobs: jobs.map((job) => savedJobResponse(job, savedIds.has(job.id))),
  });
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
  res.status(200).json({
    selectionId: selection.id,
    jobIds: selection.items.map((item) => item.jobId),
    jobs: selection.items.map((item) => ({
      ...savedJobResponse(item.job, savedIds.has(item.jobId)),
      rankPosition: item.rankPosition,
      score: item.score,
    })),
    createdAt: selection.createdAt,
  });
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
      savedJobResponse(jobsById.get(jobId)!, false),
    ),
  });
});
