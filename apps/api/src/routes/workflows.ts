import { randomUUID } from 'node:crypto';

import { Router } from 'express';

import {
  applicationOutcomes,
  applicationStatuses,
  prisma,
  workflowEventTypes,
  workflowRunStatuses,
} from '@applyso/database';

import {
  agentTaskIdempotencyKey,
  applicationIdempotencyKey,
} from '../lib/idempotency';
import {
  incrementSubmittedCount,
  QuotaExceededError,
  quotaExceededBody,
  assertCanStartApplications,
} from '../lib/quota';
import { serviceRequestAllowed } from '../lib/service-token';

export { agentTaskIdempotencyKey, applicationIdempotencyKey };

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2002' || code === '23505') return true;
  const cause = (error as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === 'object' &&
    ((cause as { code?: unknown }).code === '23505' ||
      (cause as { code?: unknown }).code === 'P2002')
  ) {
    return true;
  }
  return false;
}

interface ApplicationInput {
  dedupKey: string;
  title: string;
  companyName: string;
  applicationUrl?: string | null;
  externalId?: string | null;
  source?: string | null;
  department?: string | null;
  location?: string | null;
  descriptionRaw?: string | null;
  matchScore?: number | null;
  resumeVariantId: string | null;
}

interface StartInput {
  userId: string;
  resumeId: string;
  request: unknown;
  applications: ApplicationInput[];
}

interface ApplicationStatusUpdate {
  jobId: string;
  status: string;
  taskId?: string | null;
  errorDetail?: string | null;
  pageUrl?: string | null;
  screenshotPath?: string | null;
  result?: unknown;
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRunStatus(
  value: unknown,
): value is (typeof workflowRunStatuses)[number] {
  return (
    typeof value === 'string' &&
    (workflowRunStatuses as readonly string[]).includes(value)
  );
}

function isApplicationStatus(
  value: unknown,
): value is (typeof applicationStatuses)[number] {
  return (
    typeof value === 'string' &&
    (applicationStatuses as readonly string[]).includes(value)
  );
}

function isEventType(
  value: unknown,
): value is (typeof workflowEventTypes)[number] {
  return (
    typeof value === 'string' &&
    (workflowEventTypes as readonly string[]).includes(value)
  );
}

function parseApplication(raw: unknown): ApplicationInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  if (
    !hasString(item.dedupKey) ||
    !hasString(item.title) ||
    !hasString(item.companyName)
  ) {
    return null;
  }

  return {
    dedupKey: item.dedupKey,
    title: item.title,
    companyName: item.companyName,
    applicationUrl: hasString(item.applicationUrl) ? item.applicationUrl : null,
    externalId: hasString(item.externalId) ? item.externalId : null,
    source: hasString(item.source) ? item.source : null,
    department: hasString(item.department) ? item.department : null,
    location: hasString(item.location) ? item.location : null,
    descriptionRaw: hasString(item.descriptionRaw) ? item.descriptionRaw : null,
    matchScore:
      typeof item.matchScore === 'number' && Number.isFinite(item.matchScore)
        ? item.matchScore
        : null,
    resumeVariantId: hasString(item.resumeVariantId)
      ? item.resumeVariantId
      : null,
  };
}

function isOutcome(
  value: unknown,
): value is (typeof applicationOutcomes)[number] {
  return (
    typeof value === 'string' &&
    (applicationOutcomes as readonly string[]).includes(value)
  );
}

const SUCCESS_APPLICATION_STATUSES = new Set(['submitted', 'already_applied']);
const IN_FLIGHT_APPLICATION_STATUSES = new Set([
  'queued',
  'running',
  'starting',
  'resuming',
  'waiting_for_human',
  'browser_disconnected',
]);
const RETRYABLE_APPLICATION_STATUSES = new Set([
  'failed',
  'captcha_blocked',
  'login_required',
  'timed_out',
  'skipped',
  'cancelled',
  'pending',
  'waiting_for_human',
  'browser_disconnected',
]);

function parseJobDedupKey(workflowId: string, jobId: string): string | null {
  const prefix = `${workflowId}:`;
  return jobId.startsWith(prefix) ? jobId.slice(prefix.length) : null;
}

function terminalWorkflow(
  status: (typeof workflowRunStatuses)[number],
): boolean {
  return ['completed', 'partial', 'failed', 'cancelled'].includes(status);
}

function terminalApplication(
  status: (typeof applicationStatuses)[number],
): boolean {
  return [
    'submitted',
    'failed',
    'captcha_blocked',
    'already_applied',
    'login_required',
    'timed_out',
    'skipped',
    'cancelled',
  ].includes(status);
}

async function updateApplication(
  workflowId: string,
  update: ApplicationStatusUpdate,
): Promise<void> {
  if (!isApplicationStatus(update.status)) return;
  const dedupKey = parseJobDedupKey(workflowId, update.jobId);
  if (!dedupKey) return;

  const job = await prisma.workflowJob.findUnique({
    where: { workflowRunId_dedupKey: { workflowRunId: workflowId, dedupKey } },
    select: { id: true },
  });
  if (!job) return;

  const existing = await prisma.application.findFirst({
    where: { workflowJobId: job.id },
    select: { userId: true, status: true },
  });
  if (!existing) return;

  const now = new Date();
  await prisma.workflowJob.update({
    where: { id: job.id },
    data: {
      status: update.status === 'queued' ? 'application_queued' : undefined,
    },
  });

  await prisma.application.updateMany({
    where: { workflowJobId: job.id },
    data: {
      status: update.status,
      externalTaskId: update.taskId ?? undefined,
      errorDetail: update.errorDetail ?? null,
      pageUrl: update.pageUrl ?? undefined,
      screenshotPath: update.screenshotPath ?? undefined,
      result: (update.result ?? undefined) as never,
      submittedAt: update.status === 'submitted' ? now : undefined,
      completedAt: terminalApplication(update.status)
        ? now
        : update.status === 'queued'
          ? null
          : undefined,
      updatedAt: now,
    },
  });

  if (update.status === 'submitted' && existing.status !== 'submitted') {
    await incrementSubmittedCount(existing.userId);
  }

  if (update.taskId) {
    const application = await prisma.application.findUnique({
      where: { workflowJobId: job.id },
      select: { id: true },
    });
    if (application) {
      await prisma.agentTask.updateMany({
        where: { workflowRunId: workflowId, applicationId: application.id },
        data: {
          externalTaskId: update.taskId,
          status: update.status === 'queued' ? 'queued' : undefined,
          errorDetail: update.status === 'queued' ? null : undefined,
          completedAt: update.status === 'queued' ? null : undefined,
          updatedAt: now,
        },
      });
    }
  }
}

export const workflowsRouter = Router();

/**
 * Trusted server-to-server entry point. The web backend has already validated
 * the session and resume/variant ownership before calling this endpoint.
 */
workflowsRouter.post('/internal/start', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const body = req.body as Partial<StartInput>;
  if (
    !hasString(body.userId) ||
    !hasString(body.resumeId) ||
    !Array.isArray(body.applications) ||
    body.applications.length === 0 ||
    body.applications.length > 10
  ) {
    res.status(400).json({ error: 'Invalid workflow start payload' });
    return;
  }

  const requestedApplications = body.applications.map(parseApplication);
  if (requestedApplications.some((application) => application === null)) {
    res.status(400).json({ error: 'Invalid application in workflow payload' });
    return;
  }

  const selectedApplications = requestedApplications as ApplicationInput[];
  const uniqueKeys = new Set(selectedApplications.map((job) => job.dedupKey));
  if (uniqueKeys.size !== selectedApplications.length) {
    res.status(400).json({ error: 'Each selected job must be unique' });
    return;
  }

  const userId = body.userId!;
  const idempotencyKeys = selectedApplications.map((job) =>
    applicationIdempotencyKey(userId, job.dedupKey, job.resumeVariantId),
  );

  let existingRows: {
    idempotencyKey: string;
    status: string;
    workflowRun: { status: string } | null;
  }[];
  try {
    existingRows = await prisma.application.findMany({
      where: { userId, idempotencyKey: { in: idempotencyKeys } },
      select: {
        idempotencyKey: true,
        status: true,
        workflowRun: { select: { status: true } },
      },
    });
  } catch (error) {
    console.error('[workflows] failed to load existing applications:', error);
    res.status(500).json({
      error:
        'Workflow tables are missing or the database is unavailable. Run prisma migrate deploy against the API database.',
    });
    return;
  }
  const existingByKey = new Map(
    existingRows.map((row) => [
      row.idempotencyKey,
      {
        application: { idempotencyKey: row.idempotencyKey, status: row.status },
        workflowStatus: row.workflowRun?.status ?? null,
      },
    ]),
  );

  const skipped: { dedupKey: string; reason: string }[] = [];
  const toCreate: ApplicationInput[] = [];
  const toReuse: {
    job: ApplicationInput;
    applicationId: string;
    agentTaskKey: string;
  }[] = [];

  // Reuse lookups need application ids for retryable rows.
  const retryableIds = new Map<string, string>();
  if (existingByKey.size > 0) {
    const fullRows = await prisma.application.findMany({
      where: { userId, idempotencyKey: { in: [...existingByKey.keys()] } },
      select: { id: true, idempotencyKey: true },
    });
    for (const row of fullRows) retryableIds.set(row.idempotencyKey, row.id);
  }

  for (const job of selectedApplications) {
    const applicationKey = applicationIdempotencyKey(
      userId,
      job.dedupKey,
      job.resumeVariantId,
    );
    const existing = existingByKey.get(applicationKey);
    if (!existing) {
      toCreate.push(job);
      continue;
    }

    const status = existing.application.status;
    const runIsActive = existing.workflowStatus
      ? !terminalWorkflow(
          existing.workflowStatus as (typeof workflowRunStatuses)[number],
        )
      : false;
    if (SUCCESS_APPLICATION_STATUSES.has(status)) {
      skipped.push({ dedupKey: job.dedupKey, reason: 'already_applied' });
      continue;
    }
    if (
      IN_FLIGHT_APPLICATION_STATUSES.has(status) ||
      (status === 'pending' && runIsActive)
    ) {
      skipped.push({ dedupKey: job.dedupKey, reason: 'in_progress' });
      continue;
    }
    if (RETRYABLE_APPLICATION_STATUSES.has(status)) {
      const applicationId = retryableIds.get(applicationKey);
      if (!applicationId) {
        toCreate.push(job);
        continue;
      }
      toReuse.push({
        job,
        applicationId,
        agentTaskKey: agentTaskIdempotencyKey(applicationKey),
      });
      continue;
    }
    skipped.push({ dedupKey: job.dedupKey, reason: 'already_applied' });
  }

  if (toCreate.length === 0 && toReuse.length === 0) {
    res.status(409).json({
      error: 'Those jobs were already applied or are still in progress',
      skipped,
    });
    return;
  }

  try {
    await assertCanStartApplications(userId, toCreate.length);
  } catch (error) {
    if (error instanceof QuotaExceededError) {
      res.status(402).json(quotaExceededBody());
      return;
    }
    throw error;
  }

  const workflowId = randomUUID();
  const now = new Date();

  try {
    await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.workflowRun.create({
        data: {
          id: workflowId,
          userId,
          resumeId: body.resumeId!,
          status: 'pending',
          request: (body.request ?? {}) as never,
          startedAt: now,
        },
      });

      for (const job of toCreate) {
        const workflowJob = await tx.workflowJob.create({
          data: {
            workflowRunId: workflowId,
            userId,
            dedupKey: job.dedupKey,
            externalId: job.externalId,
            source: job.source,
            title: job.title,
            companyName: job.companyName,
            department: job.department,
            location: job.location,
            applicationUrl: job.applicationUrl,
            descriptionRaw: job.descriptionRaw,
            status: 'matched',
            matchScore: job.matchScore,
            matchedAt: now,
          },
          select: { id: true },
        });

        const applicationKey = applicationIdempotencyKey(
          userId,
          job.dedupKey,
          job.resumeVariantId,
        );
        const application = await tx.application.create({
          data: {
            workflowRunId: workflowId,
            workflowJobId: workflowJob.id,
            userId,
            resumeId: body.resumeId!,
            resumeVariantId: job.resumeVariantId,
            status: 'pending',
            idempotencyKey: applicationKey,
            atsType: job.source,
            applicationUrl: job.applicationUrl,
          },
          select: { id: true },
        });

        await tx.agentTask.create({
          data: {
            workflowRunId: workflowId,
            applicationId: application.id,
            userId,
            agentName: 'apply-agent',
            taskType: 'submit_application',
            status: 'pending',
            idempotencyKey: agentTaskIdempotencyKey(applicationKey),
            payload: { dedupKey: job.dedupKey },
          },
        });
      }

      for (const item of toReuse) {
        const workflowJob = await tx.workflowJob.create({
          data: {
            workflowRunId: workflowId,
            userId,
            dedupKey: item.job.dedupKey,
            externalId: item.job.externalId,
            source: item.job.source,
            title: item.job.title,
            companyName: item.job.companyName,
            department: item.job.department,
            location: item.job.location,
            applicationUrl: item.job.applicationUrl,
            descriptionRaw: item.job.descriptionRaw,
            status: 'matched',
            matchScore: item.job.matchScore,
            matchedAt: now,
          },
          select: { id: true },
        });

        await tx.application.update({
          where: { id: item.applicationId },
          data: {
            workflowRunId: workflowId,
            workflowJobId: workflowJob.id,
            resumeId: body.resumeId!,
            status: 'pending',
            externalTaskId: null,
            errorDetail: null,
            pageUrl: null,
            screenshotPath: null,
            completedAt: null,
            submittedAt: null,
          },
        });

        await tx.agentTask.updateMany({
          where: { userId, idempotencyKey: item.agentTaskKey },
          data: {
            workflowRunId: workflowId,
            applicationId: item.applicationId,
            status: 'pending',
            externalTaskId: null,
            errorDetail: null,
            completedAt: null,
            payload: { dedupKey: item.job.dedupKey },
          },
        });
      }

      await tx.workflowEvent.create({
        data: {
          workflowRunId: workflowId,
          userId,
          eventType: 'workflow.created',
          idempotencyKey: 'created',
          payload: {
            selectedJobCount: toCreate.length + toReuse.length,
            skipped,
          },
          occurredAt: now,
        },
      });
    });

    res.status(201).json({
      workflowId,
      queued: [...toCreate, ...toReuse.map((item) => item.job)].map(
        (job) => job.dedupKey,
      ),
      skipped,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Concurrent start for the same user+job+variant lost the race.
      res.status(409).json({
        error: 'Those jobs were already applied or are still in progress',
        skipped: [
          ...skipped,
          ...toCreate.map((job) => ({
            dedupKey: job.dedupKey,
            reason: 'in_progress',
          })),
        ],
      });
      return;
    }
    console.error('[workflows] durable workflow creation failed:', error);
    res.status(500).json({ error: 'Failed to create durable workflow' });
  }
});

/** Trusted read used by server-side ownership checks in the web application. */
workflowsRouter.get('/internal/:workflowId', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const workflow = await prisma.workflowRun.findUnique({
    where: { id: req.params.workflowId },
  });
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  const jobs = await prisma.workflowJob.findMany({
    where: { workflowRunId: workflow.id },
  });
  const applicationRows = await prisma.application.findMany({
    where: { workflowRunId: workflow.id },
  });

  res.status(200).json({ workflow, jobs, applications: applicationRows });
});

/** Trusted retry lookup for an application and its immutable workflow input. */
workflowsRouter.get(
  '/internal/applications/:applicationId',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal workflow request' });
      return;
    }

    const application = await prisma.application.findUnique({
      where: { id: req.params.applicationId },
    });
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const workflowJob = application.workflowJobId
      ? await prisma.workflowJob.findUnique({
          where: { id: application.workflowJobId },
        })
      : null;
    const workflow = await prisma.workflowRun.findUnique({
      where: { id: application.workflowRunId },
    });
    if (!workflowJob || !workflow) {
      res
        .status(409)
        .json({ error: 'Application workflow data is incomplete' });
      return;
    }

    res.status(200).json({ application, workflowJob, workflow });
  },
);

/** Trusted durable event reader. `after` is an exclusive ISO timestamp cursor. */
workflowsRouter.get('/internal/:workflowId/events', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const after =
    typeof req.query.after === 'string' ? new Date(req.query.after) : null;
  if (after && Number.isNaN(after.getTime())) {
    res.status(400).json({ error: 'after must be an ISO-8601 timestamp' });
    return;
  }

  const events = await prisma.workflowEvent.findMany({
    where: after
      ? { workflowRunId: req.params.workflowId, occurredAt: { gt: after } }
      : { workflowRunId: req.params.workflowId },
    orderBy: { occurredAt: 'asc' },
    take: 100,
  });

  res.status(200).json({ events });
});

/** Trusted orchestrator callback for workflow and application state changes. */
workflowsRouter.post('/internal/:workflowId/status', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const { workflowId } = req.params;
  const body = req.body as {
    status?: unknown;
    errorDetail?: unknown;
    eventType?: unknown;
    eventKey?: unknown;
    payload?: unknown;
    applications?: unknown;
  };
  if (!isRunStatus(body.status)) {
    res.status(400).json({ error: 'Invalid workflow status' });
    return;
  }

  const updates = Array.isArray(body.applications)
    ? body.applications.filter(
        (item): item is ApplicationStatusUpdate =>
          Boolean(item) &&
          typeof item === 'object' &&
          hasString((item as ApplicationStatusUpdate).jobId) &&
          hasString((item as ApplicationStatusUpdate).status),
      )
    : [];
  const eventType = isEventType(body.eventType)
    ? body.eventType
    : 'workflow.status_changed';
  // Hoist narrowed values: TS drops property narrowing inside closures.
  const nextStatus = body.status;
  const errorDetail = hasString(body.errorDetail)
    ? body.errorDetail
    : undefined;
  const now = new Date();

  try {
    const workflow = await prisma.workflowRun.findUnique({
      where: { id: workflowId },
      select: { userId: true },
    });
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    await prisma.$transaction(async (tx: typeof prisma) => {
      await tx.workflowRun.update({
        where: { id: workflowId },
        data: {
          status: nextStatus,
          errorDetail,
          completedAt: terminalWorkflow(nextStatus) ? now : undefined,
        },
      });

      for (const update of updates) {
        await updateApplication(workflowId, update);
      }

      const idempotencyKey = hasString(body.eventKey) ? body.eventKey : null;
      if (idempotencyKey) {
        try {
          await tx.workflowEvent.create({
            data: {
              workflowRunId: workflowId,
              userId: workflow.userId,
              eventType,
              idempotencyKey,
              payload: (body.payload ?? {
                status: body.status,
                applications: updates,
              }) as never,
              occurredAt: now,
            },
          });
        } catch (error) {
          if (!isUniqueViolation(error)) throw error;
          // Duplicate orchestrator callback — safe to ignore.
        }
      } else {
        await tx.workflowEvent.create({
          data: {
            workflowRunId: workflowId,
            userId: workflow.userId,
            eventType,
            idempotencyKey: null,
            payload: (body.payload ?? {
              status: body.status,
              applications: updates,
            }) as never,
            occurredAt: now,
          },
        });
      }
    });

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[workflows] durable workflow update failed:', error);
    res.status(500).json({ error: 'Failed to update durable workflow' });
  }
});

/** Record a hiring-loop outcome for matching feedback. */
workflowsRouter.patch(
  '/internal/:workflowId/applications/outcome',
  async (req, res) => {
    if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal workflow request' });
      return;
    }

    const jobId = (req.body as { jobId?: unknown }).jobId;
    const outcome = (req.body as { outcome?: unknown }).outcome;
    if (!hasString(jobId) || !isOutcome(outcome)) {
      res.status(400).json({ error: 'Invalid application outcome' });
      return;
    }

    const dedupKey = parseJobDedupKey(req.params.workflowId, jobId);
    if (!dedupKey) {
      res.status(400).json({ error: 'Invalid job id' });
      return;
    }

    const job = await prisma.workflowJob.findUnique({
      where: {
        workflowRunId_dedupKey: {
          workflowRunId: req.params.workflowId,
          dedupKey,
        },
      },
      select: { id: true },
    });
    if (!job) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    await prisma.application.updateMany({
      where: { workflowJobId: job.id },
      data: { outcome },
    });

    res.status(200).json({ ok: true, outcome });
  },
);
