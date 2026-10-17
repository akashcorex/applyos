import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';

import * as databaseEnums from '../packages/database/src/enums';

import type { AddressInfo } from 'node:net';

type SessionUser = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: string;
};

let sessionUser: SessionUser | null = null;

const resumeFile = {
  findMany: mock(async () => [] as unknown[]),
  findUnique: mock(async () => null as unknown),
  create: mock(async () => ({})),
  update: mock(async () => ({})),
};
const resumeExtraction = {
  findFirst: mock(async () => null as unknown),
  count: mock(async () => 0),
  create: mock(async () => ({})),
  update: mock(async () => ({})),
};
const profile = {
  findUnique: mock(async () => null as unknown),
  findFirst: mock(async () => null as unknown),
  update: mock(async () => ({})),
  upsert: mock(async () => ({})),
};
const job = {
  findUnique: mock(async () => null as unknown),
  findMany: mock(async () => [] as unknown[]),
  upsert: mock(async () => ({})),
  updateMany: mock(async () => ({ count: 0 })),
};
const company = {
  upsert: mock(async () => ({})),
};
const savedJob = {
  findMany: mock(async () => [] as unknown[]),
  upsert: mock(async () => ({})),
  deleteMany: mock(async () => ({ count: 0 })),
};
const matchSession = {
  findFirst: mock(async () => null as unknown),
  findUnique: mock(async () => null as unknown),
  findMany: mock(async () => [] as unknown[]),
  create: mock(async () => ({})),
  update: mock(async () => ({})),
};
const matchInteraction = {
  create: mock(async () => ({})),
  createMany: mock(async () => ({ count: 0 })),
};
const jobSelection = {
  findFirst: mock(async () => null as unknown),
  create: mock(async () => ({ id: 'selection-1' })),
};
const jobSelectionItem = {
  createMany: mock(async () => ({ count: 0 })),
};
const userPreferences = {
  findUnique: mock(async () => null as unknown),
  upsert: mock(async () => ({})),
};
const linkedinConnect = {
  upsert: mock(async () => ({})),
  findMany: mock(async () => []),
};

const prismaMock = {
  resumeFile,
  resumeExtraction,
  profile,
  job,
  company,
  savedJob,
  matchSession,
  matchInteraction,
  jobSelection,
  jobSelectionItem,
  userPreferences,
  analyticsEvent: { create: mock(async () => ({})) },
  linkedinConnect,
  $transaction: mock(async (ops: unknown) =>
    Array.isArray(ops)
      ? Promise.all(ops)
      : (ops as (tx: unknown) => unknown)(prismaMock),
  ),
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
  ...databaseEnums,
}));

const { setSessionUserOverride } = await import('../apps/api/src/lib/authz');
const { resumesInternalRouter, resumesRouter } =
  await import('../apps/api/src/routes/resumes');
const { linkedinConnectsRouter } =
  await import('../apps/api/src/routes/linkedin-connects');
const { jobsInternalRouter, jobsRouter } =
  await import('../apps/api/src/routes/jobs');
const { preferencesRouter } =
  await import('../apps/api/src/routes/preferences');
const { workflowsRouter } = await import('../apps/api/src/routes/workflows');

process.env.AGENT_SERVICE_TOKEN = 'test-service-token';

const app = express();
app.use(express.json());
app.use('/v1/resumes', resumesInternalRouter);
app.use('/v1/resumes', resumesRouter);
app.use('/v1/linkedin-connects', linkedinConnectsRouter);
app.use('/v1/jobs', jobsInternalRouter);
app.use('/v1/jobs', jobsRouter);
app.use('/v1/preferences', preferencesRouter);
app.use('/v1/workflows', workflowsRouter);

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  setSessionUserOverride(null);
  server.close();
});

beforeEach(() => {
  sessionUser = null;
  setSessionUserOverride(() => sessionUser);
  resumeFile.findMany.mockReset();
  resumeFile.findUnique.mockReset();
  resumeFile.create.mockReset();
  resumeFile.update.mockReset();
  resumeExtraction.findFirst.mockReset();
  resumeExtraction.count.mockReset();
  resumeExtraction.create.mockReset();
  resumeExtraction.update.mockReset();
  profile.findUnique.mockReset();
  profile.findFirst.mockReset();
  profile.update.mockReset();
  profile.upsert.mockReset();
  linkedinConnect.upsert.mockReset();
  job.findUnique.mockReset();
  job.findMany.mockReset();
  job.upsert.mockReset();
  job.updateMany.mockReset();
  company.upsert.mockReset();
  savedJob.findMany.mockReset();
  savedJob.upsert.mockReset();
  savedJob.deleteMany.mockReset();
  matchSession.findFirst.mockReset();
  matchSession.findUnique.mockReset();
  matchSession.findMany.mockReset();
  matchSession.create.mockReset();
  matchSession.update.mockReset();
  matchSession.findMany.mockResolvedValue([]);
  matchInteraction.create.mockReset();
  matchInteraction.createMany.mockReset();
  jobSelection.findFirst.mockReset();
  jobSelection.create.mockReset();
  jobSelectionItem.createMany.mockReset();
  userPreferences.findUnique.mockReset();
  userPreferences.upsert.mockReset();
  resumeFile.findMany.mockResolvedValue([]);
  resumeFile.findUnique.mockResolvedValue(null);
  profile.findFirst.mockResolvedValue(null);
  jobSelection.create.mockResolvedValue({ id: 'selection-1' });
  jobSelection.findFirst.mockResolvedValue(null);
  userPreferences.findUnique.mockResolvedValue(null);
  resumeExtraction.findFirst.mockResolvedValue(null);
  resumeExtraction.count.mockResolvedValue(0);
});

const USER_A: SessionUser = {
  id: 'user-a',
  email: 'a@example.com',
  role: 'USER',
  status: 'ACTIVE',
};

describe('Phase 2 HTTP auth + lifecycle', () => {
  it('GET /v1/resumes is 401 without a session', async () => {
    const res = await fetch(`${base}/v1/resumes`);
    expect(res.status).toBe(401);
  });

  it('GET /v1/resumes is 200 for the session user', async () => {
    sessionUser = USER_A;
    resumeFile.findMany.mockResolvedValue([{ id: 'rf-1', userId: 'user-a' }]);
    const res = await fetch(`${base}/v1/resumes`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { resumes: { id: string }[] };
    expect(body.resumes).toHaveLength(1);
  });

  it('GET /v1/resumes/:id is 404 for another user (IDOR)', async () => {
    sessionUser = USER_A;
    resumeFile.findUnique.mockResolvedValue({
      id: 'rf-other',
      userId: 'user-b',
    });
    const res = await fetch(`${base}/v1/resumes/rf-other`);
    expect(res.status).toBe(404);
  });

  it('POST /internal/:id/complete is 401 without a service token', async () => {
    const res = await fetch(`${base}/v1/resumes/internal/rf-1/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: 'Ada', email: 'ada@example.com' }),
    });
    expect(res.status).toBe(401);
  });

  it('POST /internal/:id/complete succeeds with a token and no session', async () => {
    resumeFile.findUnique.mockResolvedValue({
      id: 'rf-1',
      userId: 'user-a',
      status: 'PROCESSING',
      parserVersion: 'resume-parser.v1',
    });
    resumeExtraction.findFirst.mockResolvedValue({
      id: 'ext-open',
      revisionNumber: 1,
      status: 'PROCESSING',
    });
    profile.findUnique.mockResolvedValue(null);

    const res = await fetch(`${base}/v1/resumes/internal/rf-1/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': 'test-service-token',
      },
      body: JSON.stringify({
        extraction: {
          fullName: 'Ada Lovelace',
          email: 'ada@example.com',
        },
        resumeId: '11111111-1111-4111-8111-111111111111',
      }),
    });
    expect(res.status).toBe(200);
    expect(resumeExtraction.update.mock.calls.length).toBeGreaterThan(0);
    expect(resumeExtraction.create.mock.calls.length).toBe(0);
  });

  it('GET /v1/jobs requires a confirmed profile', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue(null);
    const res = await fetch(`${base}/v1/jobs`);
    expect(res.status).toBe(403);
  });

  it('POST /v1/jobs/:id/select rejects more than ten jobs', async () => {
    sessionUser = USER_A;
    const res = await fetch(`${base}/v1/jobs/job-1/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobIds: Array.from({ length: 11 }, (_, index) => `job-${index}`),
      }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /v1/jobs/:id/select persists an owned selection', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({ id: 'profile-a', isConfirmed: true });
    job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        dedupKey: 'company::role::location',
        source: 'greenhouse',
        externalId: null,
        companyName: 'Acme',
        title: 'Engineer',
        titleNormalized: 'engineer',
        location: 'Remote',
        locationNormalized: 'remote',
        locationType: 'remote',
        seniority: 'mid',
        descriptionRaw: null,
        applicationUrl: 'https://example.com/job-1',
        postedAt: null,
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
        isActive: true,
      },
    ]);
    const res = await fetch(`${base}/v1/jobs/job-1/select`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds: ['job-1'] }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).selectionId).toBe('selection-1');
    expect(jobSelectionItem.createMany).toHaveBeenCalledTimes(1);
  });

  it('preferences round-trip daily limit and minimum score', async () => {
    userPreferences.findUnique.mockResolvedValue({
      userId: 'user-a',
      autoSubmitEnabled: false,
      postApplyLinkedinConnectEnabled: false,
      dailyLimit: 25,
      minScore: 80,
    });
    userPreferences.upsert.mockResolvedValue({
      userId: 'user-a',
      dailyLimit: 10,
      minScore: 75,
    });
    const headers = { 'X-Agent-Service-Token': 'test-service-token' };
    const saved = await fetch(`${base}/v1/preferences/internal/user-a`, {
      method: 'PUT',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyLimit: 10, minScore: 75 }),
    });
    expect(saved.status).toBe(200);
    expect(userPreferences.upsert.mock.calls[0]?.[0]?.update).toMatchObject({
      dailyLimit: 10,
      minScore: 75,
    });
  });

  it('workflow start rejects a canonical jobId with the wrong dedupKey', async () => {
    job.findMany.mockResolvedValue([
      { id: 'job-1', dedupKey: 'canonical::key' },
    ]);
    const res = await fetch(`${base}/v1/workflows/internal/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': 'test-service-token',
      },
      body: JSON.stringify({
        userId: 'user-a',
        resumeId: 'resume-1',
        applications: [
          {
            jobId: 'job-1',
            dedupKey: 'client::wrong',
            title: 'Engineer',
            companyName: 'Acme',
            resumeVariantId: null,
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('records owned interactions only for jobs in the match session', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({ id: 'profile-a', isConfirmed: true });
    job.findUnique.mockResolvedValue({
      id: 'job-1',
      dedupKey: 'canonical::key',
      title: 'Engineer',
      companyName: 'Acme',
    });
    matchSession.findFirst.mockResolvedValue({
      id: 'session-1',
      userId: 'user-a',
      resumeId: 'resume-1',
      topResults: [{ jobId: 'job-1' }],
    });
    matchInteraction.create.mockResolvedValue({ id: 'interaction-1' });
    const res = await fetch(`${base}/v1/jobs/job-1/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'session-1',
        eventType: 'click',
        rankPosition: 0,
        matchScore: 80,
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).interactionId).toBe('interaction-1');
  });

  it('persists a confirmed user save', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({ id: 'profile-a', isConfirmed: true });
    job.findUnique.mockResolvedValue({ id: 'job-1' });
    savedJob.upsert.mockResolvedValue({ id: 'saved-1' });
    const res = await fetch(`${base}/v1/jobs/job-1/save`, { method: 'PUT' });
    expect(res.status).toBe(200);
    expect((await res.json()).savedJobId).toBe('saved-1');
  });

  it('GET /v1/jobs?fresh=true filters to recent jobs and returns seenAt', async () => {
    sessionUser = USER_A;
    const seenAt = new Date('2026-09-01T00:00:00.000Z');
    const recentAt = new Date('2026-10-01T00:00:00.000Z');
    profile.findFirst.mockResolvedValue({
      id: 'profile-a',
      isConfirmed: true,
      jobsSeenAt: seenAt,
    });
    job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        dedupKey: 'acme::engineer::remote',
        source: 'greenhouse',
        externalId: null,
        companyName: 'Acme',
        title: 'Engineer',
        titleNormalized: 'engineer',
        location: 'Remote',
        locationNormalized: 'remote',
        locationType: 'remote',
        seniority: null,
        descriptionRaw: 'desc',
        applicationUrl: null,
        postedAt: null,
        firstSeenAt: recentAt,
        lastSeenAt: recentAt,
        isActive: true,
      },
    ]);
    savedJob.findMany.mockResolvedValue([]);
    matchSession.findMany.mockResolvedValue([
      {
        topResults: [
          {
            jobId: 'job-1',
            dedupKey: 'acme::engineer::remote',
            score: 77,
            reason: 'Strong fit',
            scoreResult: {
              score: 77,
              band: 'good',
              components: [
                {
                  name: 'skills',
                  weight: 0.3,
                  score: 80,
                  contribution: 24,
                  evidence_tier: 'stated',
                  reason: 'TypeScript is quoted in the JD.',
                },
              ],
              confidence: 'medium',
              evidence_tier: 'stated',
              reason: 'Strong fit',
              not_evaluated: ['recency'],
            },
          },
        ],
      },
    ]);
    const res = await fetch(`${base}/v1/jobs?fresh=true&limit=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs).toHaveLength(1);
    expect(body.seenAt).toBe(seenAt.toISOString());
    expect(body.jobs[0].score).toBe(77);
    expect(body.jobs[0].scoreResult.band).toBe('good');
    expect(body.jobs[0].scoreResult.components).toHaveLength(1);
    expect(body.jobs[0].scoreResult.not_evaluated).toEqual(['recency']);
    const where = job.findMany.mock.calls[0]?.[0]?.where;
    expect(where.isActive).toBe(true);
    expect(where.firstSeenAt.gte).toBeInstanceOf(Date);
    expect(job.findMany.mock.calls[0]?.[0]?.orderBy).toEqual({
      firstSeenAt: 'desc',
    });
  });

  it('GET /v1/jobs/discover/:id returns the stored ScoreResult', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({
      id: 'profile-a',
      isConfirmed: true,
    });
    const recentAt = new Date('2026-10-01T00:00:00.000Z');
    matchSession.findFirst.mockResolvedValue({
      topResults: [
        {
          jobId: 'job-1',
          dedupKey: 'acme::engineer::remote',
          score: 64,
          reason: 'Good fit',
          scoreResult: {
            score: 64,
            band: 'good',
            components: [
              {
                name: 'skills',
                weight: 0.3,
                score: 70,
                contribution: 21,
                evidence_tier: 'stated',
                reason: 'TypeScript is quoted in the JD.',
              },
            ],
            confidence: 'medium',
            evidence_tier: 'stated',
            reason: 'Good fit',
            not_evaluated: ['recency'],
          },
        },
      ],
      discoveryStatus: 'complete',
      discoveryError: null,
    });
    job.findMany.mockResolvedValue([
      {
        id: 'job-1',
        dedupKey: 'acme::engineer::remote',
        source: 'greenhouse',
        externalId: null,
        companyName: 'Acme',
        title: 'Engineer',
        titleNormalized: 'engineer',
        location: 'Remote',
        locationNormalized: 'remote',
        locationType: 'remote',
        seniority: null,
        descriptionRaw: 'desc',
        applicationUrl: null,
        postedAt: null,
        firstSeenAt: recentAt,
        lastSeenAt: recentAt,
        isActive: true,
      },
    ]);
    savedJob.findMany.mockResolvedValue([]);
    const res = await fetch(
      `${base}/v1/jobs/discover/session-1?limit=10&offset=0`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.jobs[0].score).toBe(64);
    expect(body.jobs[0].scoreResult.band).toBe('good');
    expect(body.jobs[0].scoreResult.components[0].name).toBe('skills');
    expect(body.jobs[0].scoreResult.not_evaluated).toEqual(['recency']);
  });

  it('POST /v1/jobs/seen stamps the profile watermark', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({
      id: 'profile-a',
      isConfirmed: true,
    });
    profile.update.mockResolvedValue({ id: 'profile-a' });
    const res = await fetch(`${base}/v1/jobs/seen`, { method: 'POST' });
    expect(res.status).toBe(200);
    expect((await res.json()).seenAt).toBeDefined();
    expect(profile.update.mock.calls[0]?.[0]?.where).toEqual({
      id: 'profile-a',
    });
    expect(profile.update.mock.calls[0]?.[0]?.data.jobsSeenAt).toBeInstanceOf(
      Date,
    );
  });

  it('POST /v1/jobs/seen is 403 without a confirmed profile', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue(null);
    const res = await fetch(`${base}/v1/jobs/seen`, { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('POST /v1/jobs/internal/reconcile closes stale listings', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      if (url.endsWith('/registry')) {
        return new Response(
          JSON.stringify({
            boards: [
              { domain: 'acme.com', active: true },
              { domain: 'stale.example', active: true },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('board-keys')) {
        if (url.includes('acme.com')) {
          return new Response(
            JSON.stringify({
              domain: 'acme.com',
              scraped_at: new Date().toISOString(),
              keys: ['acme::engineer'],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response(
          JSON.stringify({
            domain: 'stale.example',
            scraped_at: null,
            keys: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      job.updateMany.mockResolvedValue({ count: 1 });
      const res = await fetch(`${base}/v1/jobs/internal/reconcile`, {
        method: 'POST',
        headers: { 'x-agent-service-token': 'test-service-token' },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.boards).toBe(2);
      expect(body.skippedBoards).toBe(1);
      const touchCall = job.updateMany.mock.calls[0]?.[0];
      expect(touchCall?.where?.dedupKey).toEqual({ in: ['acme::engineer'] });
      expect(touchCall?.data?.lastSeenAt).toBeInstanceOf(Date);
      const closeCall = job.updateMany.mock.calls[1]?.[0];
      expect(closeCall?.where?.isActive).toBe(true);
      expect(closeCall?.where?.dedupKey).toEqual({
        startsWith: 'acme.com::',
      });
      expect(closeCall?.where?.lastSeenAt?.lt).toBeInstanceOf(Date);
      expect(closeCall?.data).toEqual({
        isActive: false,
        closedAt: expect.any(Date),
      });
      const backstopCall = job.updateMany.mock.calls[2]?.[0];
      expect(backstopCall?.where?.OR).toHaveLength(2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('POST /v1/jobs/internal/reconcile is 401 without the service token', async () => {
    const res = await fetch(`${base}/v1/jobs/internal/reconcile`, {
      method: 'POST',
    });
    expect(res.status).toBe(401);
  });

  it('accepts discovery and upserts jobs in the background preserving first seen time', async () => {
    sessionUser = USER_A;
    profile.findFirst.mockResolvedValue({
      id: 'profile-a',
      isConfirmed: true,
      preferredRoles: ['Engineer'],
      preferredLocations: ['Remote'],
      skills: ['TypeScript'],
      totalExperienceYears: 3,
      seniority: 'mid',
      workMode: 'remote',
      sourceResumeFile: {
        resume: {
          id: 'resume-1',
          experienceYears: 3,
          preferredRole: 'Engineer',
        },
      },
    });
    const firstSeenAt = new Date('2026-01-01T00:00:00.000Z');
    const firstJob = {
      id: 'job-1',
      dedupKey: 'acme::engineer::remote',
      firstSeenAt,
      lastSeenAt: firstSeenAt,
      companyName: 'Acme',
      title: 'Engineer',
      location: 'Remote',
      seniority: 'mid',
    };
    const secondSeenAt = new Date('2026-01-02T00:00:00.000Z');
    job.upsert.mockResolvedValueOnce(firstJob);
    job.upsert.mockResolvedValueOnce({
      ...firstJob,
      lastSeenAt: secondSeenAt,
    });
    matchSession.create.mockResolvedValue({ id: 'session-1' });
    matchSession.update.mockResolvedValue({ id: 'session-1' });
    savedJob.findMany.mockResolvedValue([]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input, init) => {
      if (String(input).includes('127.0.0.1:8005')) {
        return new Response(
          JSON.stringify({
            session_id: 'session-1',
            jobs_scraped: 1,
            companies_scraped: 1,
            jobs: [
              {
                dedup_key: 'acme::engineer::remote',
                company_name: 'Acme',
                title: 'Engineer',
                location: 'Remote',
                match_score: 84,
                reason: 'Strong fit',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    try {
      const first = await fetch(`${base}/v1/jobs/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: 'profile-a', limit: 1 }),
      });
      const second = await fetch(`${base}/v1/jobs/discover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: 'profile-a', limit: 1 }),
      });
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      for (
        let attempt = 0;
        attempt < 50 && job.upsert.mock.calls.length < 2;
        attempt += 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      expect(job.upsert).toHaveBeenCalledTimes(2);
      expect(job.upsert.mock.calls[0]?.[0]?.create.firstSeenAt).toBeInstanceOf(
        Date,
      );
      expect(job.upsert.mock.calls[1]?.[0]?.update.lastSeenAt).toBeInstanceOf(
        Date,
      );
      const storedTopResults =
        matchSession.update.mock.calls[0]?.[0]?.data.topResults;
      expect(storedTopResults).toHaveLength(1);
      expect(storedTopResults[0].scoreResult.score).toBe(84);
      expect(storedTopResults[0].scoreResult.band).toBe('strong');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('PATCH status COMPLETED is 409 for a session user', async () => {
    sessionUser = USER_A;
    resumeFile.findUnique.mockResolvedValue({
      id: 'rf-1',
      userId: 'user-a',
      status: 'PROCESSING',
    });
    const res = await fetch(`${base}/v1/resumes/rf-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'COMPLETED' }),
    });
    expect(res.status).toBe(409);
  });

  it('POST /v1/linkedin-connects/bulk is 401 without a token', async () => {
    const res = await fetch(`${base}/v1/linkedin-connects/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        connects: [
          {
            userId: 'u',
            jobId: 'j',
            companyName: 'Acme',
            profileUrl: 'https://linkedin.com/in/x',
            profileName: 'X',
            status: 'queued',
          },
        ],
      }),
    });
    expect(res.status).toBe(401);
  });
});
