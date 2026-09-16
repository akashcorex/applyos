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

const profile = {
  findUnique: mock(async () => null as unknown),
};
const resumeFile = {
  count: mock(async () => 0),
  findFirst: mock(async () => null as unknown),
  findMany: mock(async () => [] as unknown[]),
};
const application = {
  count: mock(async () => 0),
  findMany: mock(async () => [] as unknown[]),
};
const workflowRun = {
  count: mock(async () => 0),
  findMany: mock(async () => [] as unknown[]),
};
const matchSession = {
  findMany: mock(async () => [] as unknown[]),
};

const prismaMock = {
  profile,
  resumeFile,
  application,
  workflowRun,
  matchSession,
  analyticsEvent: { create: mock(async () => ({})) },
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
  ...databaseEnums,
}));

const { setSessionUserOverride } = await import('../apps/api/src/lib/authz');
const { profilesRouter } = await import('../apps/api/src/routes/profiles');

const app = express();
app.use(express.json());
app.use('/v1/profiles', profilesRouter);

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  setSessionUserOverride(null);
  server.close();
});

beforeEach(() => {
  sessionUser = {
    id: 'user-a',
    email: 'a@example.com',
    role: 'USER',
    status: 'ACTIVE',
  };
  setSessionUserOverride(() => sessionUser);
  profile.findUnique.mockReset();
  resumeFile.count.mockReset();
  resumeFile.findFirst.mockReset();
  resumeFile.findMany.mockReset();
  application.count.mockReset();
  application.findMany.mockReset();
  workflowRun.count.mockReset();
  workflowRun.findMany.mockReset();
  matchSession.findMany.mockReset();
  profile.findUnique.mockImplementation(async () => null);
  resumeFile.count.mockImplementation(async () => 0);
  resumeFile.findFirst.mockImplementation(async () => null);
  resumeFile.findMany.mockImplementation(async () => []);
  application.count.mockImplementation(async () => 0);
  application.findMany.mockImplementation(async () => []);
  workflowRun.count.mockImplementation(async () => 0);
  workflowRun.findMany.mockImplementation(async () => []);
  matchSession.findMany.mockImplementation(async () => []);
});

describe('GET /v1/profiles/me/summary', () => {
  it('rejects unauthenticated callers', async () => {
    setSessionUserOverride(() => null);
    const res = await fetch(`${base}/v1/profiles/me/summary`);
    expect(res.status).toBe(401);
  });

  it('scopes queries to the session user and returns empty activity', async () => {
    const res = await fetch(`${base}/v1/profiles/me/summary?timeZone=UTC`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      completion: { nextAction: string; percent: number };
      resume: null;
      activity: { days: { count: number }[]; totals: { events: number } };
    };
    expect(body.completion.nextAction).toBe('upload-resume');
    expect(body.resume).toBe(null);
    expect(body.activity.totals.events).toBe(0);
    expect(body.activity.days.length).toBeGreaterThan(360);
    expect(application.findMany.mock.calls[0]?.[0]?.where?.userId).toBe(
      'user-a',
    );
    expect(application.findMany.mock.calls[0]?.[0]?.where?.OR).toBeDefined();
    expect(resumeFile.count.mock.calls[0]?.[0]?.where).toEqual({
      userId: 'user-a',
      deletedAt: null,
    });
    expect(resumeFile.findMany.mock.calls[0]?.[0]?.where?.userId).toBe(
      'user-a',
    );
  });

  it('buckets mixed source timestamps into local days', async () => {
    application.findMany.mockImplementation(async () => [
      {
        createdAt: new Date('2026-03-20T18:30:00.000Z'),
        submittedAt: new Date('2026-03-21T10:00:00.000Z'),
        status: 'submitted',
      },
    ]);
    workflowRun.findMany.mockImplementation(async () => [
      {
        createdAt: new Date('2026-03-21T01:00:00.000Z'),
        startedAt: new Date('2026-03-21T01:00:00.000Z'),
        status: 'applying',
      },
    ]);
    matchSession.findMany.mockImplementation(async () => [
      { createdAt: new Date('2026-03-21T02:00:00.000Z') },
    ]);
    resumeFile.findMany.mockImplementation(async () => [
      {
        createdAt: new Date('2026-03-21T03:00:00.000Z'),
        processedAt: new Date('2026-03-21T04:00:00.000Z'),
        status: 'COMPLETED',
      },
    ]);
    resumeFile.count.mockImplementation(async () => 1);
    application.count.mockImplementation(async () => 1);
    workflowRun.count.mockImplementation(async () => 1);

    const res = await fetch(
      `${base}/v1/profiles/me/summary?timeZone=Asia/Kolkata`,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      activity: {
        days: { date: string; count: number; kinds: string[] }[];
        totals: {
          applications: number;
          submitted: number;
          activeWorkflows: number;
          events: number;
        };
      };
    };
    const active = body.activity.days.filter((day) => day.count > 0);
    expect(active.some((day) => day.date === '2026-03-21')).toBe(true);
    expect(body.activity.totals.applications).toBe(1);
    expect(body.activity.totals.submitted).toBe(1);
    expect(body.activity.totals.activeWorkflows).toBe(1);
    expect(body.activity.totals.events).toBeGreaterThan(0);
    const kinds = new Set(active.flatMap((day) => day.kinds));
    expect(kinds.has('application')).toBe(true);
    expect(kinds.has('workflow')).toBe(true);
    expect(kinds.has('match')).toBe(true);
    expect(kinds.has('resume')).toBe(true);
  });
});
