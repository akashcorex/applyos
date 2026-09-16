import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import express from 'express';

import * as databaseEnums from '../packages/database/src/enums';

import type { AddressInfo } from 'node:net';

const workflowRun = {
  findUnique: mock(async () => null as unknown),
  create: mock(async (args: { data: { id: string } }) => ({
    id: args.data.id,
  })),
  update: mock(async () => ({})),
};
const workflowJob = {
  findUnique: mock(async () => ({ id: 'wf-job-1' }) as unknown),
  create: mock(async () => ({ id: 'wf-job-1' })),
  update: mock(async () => ({})),
};
const application = {
  findMany: mock(async () => [] as unknown[]),
  findFirst: mock(async () => ({
    userId: 'user-a',
    status: 'running',
  })),
  findUnique: mock(async () => ({ id: 'app-1' })),
  create: mock(async () => ({ id: 'app-1' })),
  update: mock(async () => ({})),
  updateMany: mock(async () => ({ count: 1 })),
  count: mock(async () => 0),
};
const agentTask = {
  create: mock(async () => ({})),
  updateMany: mock(async () => ({ count: 1 })),
};
const workflowEvent = {
  create: mock(async () => ({})),
};
const usageCycle = {
  findMany: mock(async () => [
    {
      id: 'cycle-1',
      userId: 'user-a',
      cycleStart: new Date(Date.now() - 86400000),
      cycleEnd: new Date(Date.now() + 86400000 * 29),
      includedApplications: 1,
      bonusApplications: 0,
      submittedCount: 0,
    },
  ]),
  create: mock(async () => ({})),
  update: mock(async () => ({})),
};
const subscription = {
  findFirst: mock(async () => null as unknown),
};
const job = {
  findMany: mock(async () => [] as unknown[]),
};

const prismaMock = {
  workflowRun,
  workflowJob,
  application,
  agentTask,
  workflowEvent,
  usageCycle,
  subscription,
  job,
  $transaction: mock(async (fn: (tx: unknown) => unknown) =>
    fn({
      workflowRun,
      workflowJob,
      application,
      agentTask,
      workflowEvent,
    }),
  ),
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
  ...databaseEnums,
}));

const { workflowsRouter } = await import('../apps/api/src/routes/workflows');

process.env.AGENT_SERVICE_TOKEN = 'test-service-token';

const app = express();
app.use(express.json());
app.use('/v1/workflows', workflowsRouter);

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

beforeEach(() => {
  workflowRun.findUnique.mockReset();
  workflowRun.create.mockReset();
  workflowRun.update.mockReset();
  workflowJob.findUnique.mockReset();
  workflowJob.create.mockReset();
  workflowJob.update.mockReset();
  application.findMany.mockReset();
  application.findFirst.mockReset();
  application.findUnique.mockReset();
  application.create.mockReset();
  application.update.mockReset();
  application.updateMany.mockReset();
  application.count.mockReset();
  agentTask.create.mockReset();
  agentTask.updateMany.mockReset();
  workflowEvent.create.mockReset();
  usageCycle.findMany.mockReset();
  usageCycle.update.mockReset();
  subscription.findFirst.mockReset();
  job.findMany.mockReset();

  application.findMany.mockResolvedValue([]);
  application.count.mockResolvedValue(0);
  usageCycle.findMany.mockResolvedValue([
    {
      id: 'cycle-1',
      userId: 'user-a',
      cycleStart: new Date(Date.now() - 86400000),
      cycleEnd: new Date(Date.now() + 86400000 * 29),
      includedApplications: 1,
      bonusApplications: 0,
      submittedCount: 0,
    },
  ]);
  subscription.findFirst.mockResolvedValue(null);
  workflowJob.create.mockResolvedValue({ id: 'wf-job-1' });
  application.create.mockResolvedValue({ id: 'app-1' });
  job.findMany.mockResolvedValue([]);
});

afterAll(() => {
  server.close();
});

describe('Phase 3 workflow apply lifecycle', () => {
  it('creates pending applications linked to canonical jobId', async () => {
    job.findMany.mockResolvedValue([
      { id: 'job-1', dedupKey: 'acme::engineer' },
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
        request: { jobs: [] },
        applications: [
          {
            jobId: 'job-1',
            dedupKey: 'acme::engineer',
            title: 'Engineer',
            companyName: 'Acme',
            applicationUrl: 'https://example.com/apply',
            resumeVariantId: 'variant-1',
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      workflowId?: string;
      queued?: string[];
    };
    expect(body.workflowId).toBeTruthy();
    expect(body.queued).toEqual(['acme::engineer']);
    expect(workflowJob.create).toHaveBeenCalled();
    expect(application.create).toHaveBeenCalled();
    const createArgs = application.create.mock.calls[0]?.[0] as {
      data?: { status?: string; resumeVariantId?: string };
    };
    expect(createArgs?.data?.status).toBe('pending');
    expect(createArgs?.data?.resumeVariantId).toBe('variant-1');
    const jobArgs = workflowJob.create.mock.calls[0]?.[0] as {
      data?: { jobId?: string };
    };
    expect(jobArgs?.data?.jobId).toBe('job-1');
  });

  it('returns 402 when application quota is exceeded', async () => {
    usageCycle.findMany.mockResolvedValue([
      {
        id: 'cycle-1',
        userId: 'user-a',
        cycleStart: new Date(Date.now() - 86400000),
        cycleEnd: new Date(Date.now() + 86400000 * 29),
        includedApplications: 1,
        bonusApplications: 0,
        submittedCount: 1,
      },
    ]);
    application.count.mockResolvedValue(0);

    const res = await fetch(`${base}/v1/workflows/internal/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': 'test-service-token',
      },
      body: JSON.stringify({
        userId: 'user-a',
        resumeId: 'resume-1',
        request: {},
        applications: [
          {
            dedupKey: 'acme::engineer',
            title: 'Engineer',
            companyName: 'Acme',
            resumeVariantId: null,
          },
        ],
      }),
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { reason?: string };
    expect(body.reason).toBe('quota_exceeded');
    expect(application.create).not.toHaveBeenCalled();
  });

  it('increments submittedCount only on first submitted transition', async () => {
    workflowRun.findUnique.mockResolvedValue({ userId: 'user-a' });
    workflowJob.findUnique.mockResolvedValue({ id: 'wf-job-1' });
    application.findFirst
      .mockResolvedValueOnce({ userId: 'user-a', status: 'running' })
      .mockResolvedValueOnce({ userId: 'user-a', status: 'submitted' });

    const first = await fetch(`${base}/v1/workflows/internal/wf-1/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': 'test-service-token',
      },
      body: JSON.stringify({
        status: 'applying',
        applications: [
          { jobId: 'wf-1:acme::engineer', status: 'submitted', taskId: 't-1' },
        ],
      }),
    });
    expect(first.status).toBe(200);
    expect(usageCycle.update).toHaveBeenCalledTimes(1);

    usageCycle.update.mockClear();
    const second = await fetch(`${base}/v1/workflows/internal/wf-1/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Service-Token': 'test-service-token',
      },
      body: JSON.stringify({
        status: 'applying',
        applications: [
          { jobId: 'wf-1:acme::engineer', status: 'submitted', taskId: 't-2' },
        ],
      }),
    });
    expect(second.status).toBe(200);
    expect(usageCycle.update).not.toHaveBeenCalled();
  });

  it('records application outcomes for feedback', async () => {
    workflowJob.findUnique.mockResolvedValue({ id: 'wf-job-1' });
    application.updateMany.mockResolvedValue({ count: 1 });

    const res = await fetch(
      `${base}/v1/workflows/internal/wf-1/applications/outcome`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Service-Token': 'test-service-token',
        },
        body: JSON.stringify({
          jobId: 'wf-1:acme::engineer',
          outcome: 'interview',
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(application.updateMany).toHaveBeenCalled();
    const updateArgs = application.updateMany.mock.calls[0]?.[0] as {
      data?: { outcome?: string };
    };
    expect(updateArgs?.data?.outcome).toBe('interview');
  });
});
