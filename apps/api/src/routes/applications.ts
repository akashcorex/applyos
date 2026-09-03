import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import {
  applicationControlModes,
  applicationEventTypes,
  applicationStatuses,
  humanInterventionStatuses,
  humanInterventionTypes,
  prisma,
} from '@applyso/database';

import { serviceRequestAllowed } from '../lib/service-token';

export const applicationsRouter = Router();

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isApplicationStatus(
  value: unknown,
): value is (typeof applicationStatuses)[number] {
  return (
    typeof value === 'string' &&
    (applicationStatuses as readonly string[]).includes(value)
  );
}

function isControlMode(
  value: unknown,
): value is (typeof applicationControlModes)[number] {
  return (
    typeof value === 'string' &&
    (applicationControlModes as readonly string[]).includes(value)
  );
}

function isInterventionType(
  value: unknown,
): value is (typeof humanInterventionTypes)[number] {
  return (
    typeof value === 'string' &&
    (humanInterventionTypes as readonly string[]).includes(value)
  );
}

function isInterventionStatus(
  value: unknown,
): value is (typeof humanInterventionStatuses)[number] {
  return (
    typeof value === 'string' &&
    (humanInterventionStatuses as readonly string[]).includes(value)
  );
}

function isEventType(
  value: unknown,
): value is (typeof applicationEventTypes)[number] {
  return (
    typeof value === 'string' &&
    (applicationEventTypes as readonly string[]).includes(value)
  );
}

const ATTENTION_STATUSES = new Set([
  'waiting_for_human',
  'browser_disconnected',
  'captcha_blocked',
  'login_required',
]);

const RUNNING_STATUSES = new Set(['queued', 'starting', 'running', 'resuming']);

const COMPLETED_STATUSES = new Set([
  'submitted',
  'already_applied',
  'failed',
  'timed_out',
  'skipped',
  'cancelled',
]);

function filterByCategory(
  status: string,
  category: string | undefined,
): boolean {
  if (!category || category === 'all') return true;
  if (category === 'running') return RUNNING_STATUSES.has(status);
  if (category === 'attention') return ATTENTION_STATUSES.has(status);
  if (category === 'completed') return COMPLETED_STATUSES.has(status);
  return true;
}

/** List applications for a user with optional status category filter. */
applicationsRouter.get('/internal/user/:userId', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const { userId } = req.params;
  if (!hasString(userId)) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const category =
    typeof req.query.category === 'string' ? req.query.category : 'all';

  const rows = await prisma.application.findMany({
    where: { userId },
    include: {
      workflowJob: { select: { title: true, companyName: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });

  const filtered = rows.filter((row) => filterByCategory(row.status, category));

  res.status(200).json({
    applications: filtered.map((row) => ({
      ...row,
      workflowJob: undefined,
      jobTitle: row.workflowJob?.title ?? null,
      companyName: row.workflowJob?.companyName ?? null,
    })),
  });
});

/** Full application detail with open interventions and recent events. */
applicationsRouter.get('/internal/:applicationId/detail', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const { applicationId } = req.params;
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const job = application.workflowJobId
    ? await prisma.workflowJob.findUnique({
        where: { id: application.workflowJobId },
      })
    : null;

  const interventions = await prisma.humanIntervention.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  const events = await prisma.applicationEvent.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });

  res.status(200).json({
    application,
    job: job ?? null,
    interventions,
    events,
  });
});

/** Update session fields from apply-agent during an active application. */
applicationsRouter.patch(
  '/internal/:applicationId/session',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { applicationId } = req.params;
    const body = req.body as {
      status?: unknown;
      browserSessionId?: unknown;
      currentUrl?: unknown;
      currentStep?: unknown;
      controlMode?: unknown;
      humanInterventionRequired?: unknown;
      interventionReason?: unknown;
      externalTaskId?: unknown;
    };

    const now = new Date();
    const data: {
      updatedAt: Date;
      lastActivityAt: Date;
      status?: (typeof applicationStatuses)[number];
      browserSessionId?: string;
      currentUrl?: string;
      currentStep?: string;
      controlMode?: (typeof applicationControlModes)[number];
      humanInterventionRequired?: boolean;
      interventionReason?: string;
      externalTaskId?: string;
    } = {
      updatedAt: now,
      lastActivityAt: now,
    };

    if (isApplicationStatus(body.status)) data.status = body.status;
    if (hasString(body.browserSessionId)) {
      data.browserSessionId = body.browserSessionId;
    }
    if (typeof body.currentUrl === 'string') data.currentUrl = body.currentUrl;
    if (typeof body.currentStep === 'string')
      data.currentStep = body.currentStep;
    if (isControlMode(body.controlMode)) data.controlMode = body.controlMode;
    if (typeof body.humanInterventionRequired === 'boolean') {
      data.humanInterventionRequired = body.humanInterventionRequired;
    }
    if (typeof body.interventionReason === 'string') {
      data.interventionReason = body.interventionReason;
    }
    if (hasString(body.externalTaskId)) {
      data.externalTaskId = body.externalTaskId;
    }

    try {
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data,
      });
      res.status(200).json({ application: updated });
    } catch {
      res.status(404).json({ error: 'Application not found' });
    }
  },
);

/** Create a human intervention record and flag the application. */
applicationsRouter.post(
  '/internal/:applicationId/interventions',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { applicationId } = req.params;
    const body = req.body as {
      type?: unknown;
      message?: unknown;
      userId?: unknown;
    };

    if (!isInterventionType(body.type) || !hasString(body.message)) {
      res.status(400).json({ error: 'Invalid intervention type or message' });
      return;
    }

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const now = new Date();
    const intervention = await prisma.humanIntervention.create({
      data: {
        applicationId,
        userId: application.userId,
        type: body.type,
        message: body.message,
        status: 'open',
      },
    });

    await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'waiting_for_human',
        controlMode: 'human_control',
        humanInterventionRequired: true,
        interventionReason: body.message,
        updatedAt: now,
        lastActivityAt: now,
      },
    });

    res.status(201).json({ intervention });
  },
);

/** Resolve or cancel an open human intervention. */
applicationsRouter.patch(
  '/internal/interventions/:interventionId',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { interventionId } = req.params;
    const body = req.body as { status?: unknown };
    if (!isInterventionStatus(body.status) || body.status === 'open') {
      res.status(400).json({ error: 'Invalid intervention status' });
      return;
    }

    const now = new Date();
    let intervention;
    try {
      intervention = await prisma.humanIntervention.update({
        where: { id: interventionId },
        data: {
          status: body.status,
          resolvedAt: body.status === 'resolved' ? now : undefined,
        },
      });
    } catch {
      res.status(404).json({ error: 'Intervention not found' });
      return;
    }

    if (body.status === 'resolved') {
      await prisma.application.update({
        where: { id: intervention.applicationId },
        data: {
          status: 'resuming',
          controlMode: 'agent_control',
          humanInterventionRequired: false,
          interventionReason: null,
          updatedAt: now,
          lastActivityAt: now,
        },
      });
    }

    res.status(200).json({ intervention });
  },
);

/** Append an activity event to an application session. */
applicationsRouter.post('/internal/:applicationId/events', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const { applicationId } = req.params;
  const body = req.body as {
    type?: unknown;
    description?: unknown;
    metadata?: unknown;
  };

  if (!isEventType(body.type) || !hasString(body.description)) {
    res.status(400).json({ error: 'Invalid event type or description' });
    return;
  }

  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { userId: true },
  });
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const event = await prisma.applicationEvent.create({
    data: {
      applicationId,
      userId: application.userId,
      type: body.type,
      description: body.description,
      metadata:
        body.metadata && typeof body.metadata === 'object'
          ? (body.metadata as never)
          : {},
    },
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: { lastActivityAt: new Date(), updatedAt: new Date() },
  });

  res.status(201).json({ event });
});

/** Issue a short-lived scoped browser token for WebSocket access. */
applicationsRouter.post(
  '/internal/:applicationId/browser-token',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { applicationId } = req.params;
    const application = await prisma.application.findUnique({
      where: { id: applicationId },
    });
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    if (!application.browserSessionId) {
      res.status(409).json({ error: 'Browser session not ready' });
      return;
    }

    const token = randomUUID();

    const applyAgentUrl =
      process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
    const agentToken = process.env.AGENT_SERVICE_TOKEN;
    if (agentToken) {
      try {
        await fetch(
          `${applyAgentUrl}/admin/applications/${encodeURIComponent(applicationId)}/register-browser-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Agent-Service-Token': agentToken,
            },
            body: JSON.stringify({ token }),
          },
        );
      } catch {
        res
          .status(502)
          .json({ error: 'Failed to register browser token with apply-agent' });
        return;
      }
    }

    res.status(200).json({
      token,
      applicationId,
      browserSessionId: application.browserSessionId,
      expiresInSeconds: 300,
    });
  },
);

/** Register browser token with apply-agent for WebSocket auth. */
applicationsRouter.post(
  '/internal/:applicationId/register-browser-token',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const token = (req.body as { token?: unknown }).token;
    if (typeof token !== 'string' || !token.trim()) {
      res.status(400).json({ error: 'token is required' });
      return;
    }

    const applyAgentUrl =
      process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
    const agentToken = process.env.AGENT_SERVICE_TOKEN;
    if (!agentToken) {
      res.status(503).json({ error: 'Apply agent is not configured' });
      return;
    }

    try {
      const response = await fetch(
        `${applyAgentUrl}/admin/applications/${encodeURIComponent(req.params.applicationId)}/register-browser-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Service-Token': agentToken,
          },
          body: JSON.stringify({ token }),
        },
      );
      if (!response.ok) {
        res.status(502).json({ error: 'Failed to register browser token' });
        return;
      }
      res.status(200).json({ ok: true });
    } catch {
      res.status(502).json({ error: 'Apply agent is unavailable' });
    }
  },
);

/** Resolve application id from workflow run + job dedup key. */
applicationsRouter.get('/internal/resolve', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const workflowRunId =
    typeof req.query.workflowRunId === 'string'
      ? req.query.workflowRunId
      : null;
  const dedupKey =
    typeof req.query.dedupKey === 'string' ? req.query.dedupKey : null;
  if (!workflowRunId || !dedupKey) {
    res.status(400).json({ error: 'workflowRunId and dedupKey are required' });
    return;
  }

  const job = await prisma.workflowJob.findUnique({
    where: { workflowRunId_dedupKey: { workflowRunId, dedupKey } },
    select: { id: true },
  });
  if (!job) {
    res.status(404).json({ error: 'Workflow job not found' });
    return;
  }

  const application = await prisma.application.findUnique({
    where: { workflowJobId: job.id },
    select: { id: true },
  });

  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  res.status(200).json({ applicationId: application.id });
});

/** Resume agent after human intervention. */
applicationsRouter.post('/internal/:applicationId/resume', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const { applicationId } = req.params;
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }
  if (application.status !== 'waiting_for_human') {
    res
      .status(409)
      .json({ error: 'Application is not waiting for human intervention' });
    return;
  }

  const openIntervention = await prisma.humanIntervention.findFirst({
    where: { applicationId, status: 'open' },
  });

  const now = new Date();
  if (openIntervention) {
    await prisma.humanIntervention.update({
      where: { id: openIntervention.id },
      data: { status: 'resolved', resolvedAt: now },
    });
  }

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'resuming',
      controlMode: 'agent_control',
      humanInterventionRequired: false,
      interventionReason: null,
      updatedAt: now,
      lastActivityAt: now,
    },
  });

  const applyAgentUrl = process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
  const agentToken = process.env.AGENT_SERVICE_TOKEN;
  if (agentToken) {
    try {
      await fetch(
        `${applyAgentUrl}/admin/applications/${encodeURIComponent(applicationId)}/resume`,
        {
          method: 'POST',
          headers: { 'X-Agent-Service-Token': agentToken },
        },
      );
    } catch {
      res.status(502).json({ error: 'Failed to signal apply-agent resume' });
      return;
    }
  }

  res.status(200).json({ applicationId, status: 'resuming' });
});

/** Switch control to human for manual browser interaction. */
applicationsRouter.post(
  '/internal/:applicationId/take-control',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { applicationId } = req.params;
    const now = new Date();
    try {
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: {
          controlMode: 'human_control',
          updatedAt: now,
          lastActivityAt: now,
        },
      });

      const applyAgentUrl =
        process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
      const agentToken = process.env.AGENT_SERVICE_TOKEN;
      if (agentToken) {
        try {
          await fetch(
            `${applyAgentUrl}/admin/applications/${encodeURIComponent(applicationId)}/take-control`,
            {
              method: 'POST',
              headers: { 'X-Agent-Service-Token': agentToken },
            },
          );
        } catch {
          // Postgres state is updated; apply-agent sync is best-effort.
        }
      }

      res.status(200).json({ application: updated });
    } catch {
      res.status(404).json({ error: 'Application not found' });
    }
  },
);

/** Release manual control back to agent without resuming automation. */
applicationsRouter.post(
  '/internal/:applicationId/release-control',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal request' });
      return;
    }

    const { applicationId } = req.params;
    const now = new Date();
    try {
      const updated = await prisma.application.update({
        where: { id: applicationId },
        data: {
          controlMode: 'agent_control',
          updatedAt: now,
          lastActivityAt: now,
        },
      });

      const applyAgentUrl =
        process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
      const agentToken = process.env.AGENT_SERVICE_TOKEN;
      if (agentToken) {
        try {
          await fetch(
            `${applyAgentUrl}/admin/applications/${encodeURIComponent(applicationId)}/release-control`,
            {
              method: 'POST',
              headers: { 'X-Agent-Service-Token': agentToken },
            },
          );
        } catch {
          // Best-effort sync.
        }
      }

      res.status(200).json({ application: updated });
    } catch {
      res.status(404).json({ error: 'Application not found' });
    }
  },
);

/** Stop an in-progress application session. */
applicationsRouter.post('/internal/:applicationId/stop', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const { applicationId } = req.params;
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
  });
  if (!application) {
    res.status(404).json({ error: 'Application not found' });
    return;
  }

  const now = new Date();
  await prisma.application.update({
    where: { id: applicationId },
    data: {
      status: 'cancelled',
      controlMode: 'agent_control',
      humanInterventionRequired: false,
      completedAt: now,
      updatedAt: now,
      lastActivityAt: now,
    },
  });

  if (application.externalTaskId) {
    const applyAgentUrl =
      process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';
    const agentToken = process.env.AGENT_SERVICE_TOKEN;
    if (agentToken) {
      try {
        await fetch(
          `${applyAgentUrl}/admin/tasks/${encodeURIComponent(application.externalTaskId)}/cancel`,
          {
            method: 'POST',
            headers: { 'X-Agent-Service-Token': agentToken },
          },
        );
      } catch {
        // Best-effort cancellation; durable state already reflects stop.
      }
    }
  }

  res.status(200).json({ applicationId, status: 'cancelled' });
});

/** Batch-fetch open interventions for a set of application ids. */
applicationsRouter.post('/internal/interventions/open', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const body = req.body as { applicationIds?: unknown };
  if (!Array.isArray(body.applicationIds)) {
    res.status(400).json({ error: 'applicationIds array is required' });
    return;
  }

  const ids = body.applicationIds.filter(
    (id): id is string => typeof id === 'string' && id.length > 0,
  );
  if (ids.length === 0) {
    res.status(200).json({ interventions: [] });
    return;
  }

  const interventions = await prisma.humanIntervention.findMany({
    where: { applicationId: { in: ids }, status: 'open' },
  });

  res.status(200).json({ interventions });
});
