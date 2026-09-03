import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AddressInfo } from 'node:net';

import express from 'express';

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
  update: mock(async () => ({})),
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
  analyticsEvent: { create: mock(async () => ({})) },
  linkedinConnect,
  $transaction: mock(async (ops: unknown) =>
    Array.isArray(ops) ? Promise.all(ops) : ops,
  ),
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
  linkedinConnectStatuses: [
    'queued',
    'sent',
    'failed',
    'already_connected',
    'skipped_rate_limit',
  ],
}));

const { setSessionUserOverride } = await import('../apps/api/src/lib/authz');
const { resumesInternalRouter, resumesRouter } = await import(
  '../apps/api/src/routes/resumes'
);
const { linkedinConnectsRouter } = await import(
  '../apps/api/src/routes/linkedin-connects'
);

process.env.AGENT_SERVICE_TOKEN = 'test-service-token';

const app = express();
app.use(express.json());
app.use('/v1/resumes', resumesInternalRouter);
app.use('/v1/resumes', resumesRouter);
app.use('/v1/linkedin-connects', linkedinConnectsRouter);

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
  profile.update.mockReset();
  profile.upsert.mockReset();
  linkedinConnect.upsert.mockReset();
  resumeFile.findMany.mockResolvedValue([]);
  resumeFile.findUnique.mockResolvedValue(null);
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

  it('GET /v1/resumes/:id is 403 for another user (IDOR)', async () => {
    sessionUser = USER_A;
    resumeFile.findUnique.mockResolvedValue({
      id: 'rf-other',
      userId: 'user-b',
    });
    const res = await fetch(`${base}/v1/resumes/rf-other`);
    expect(res.status).toBe(403);
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
