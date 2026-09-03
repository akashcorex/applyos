import { randomUUID, timingSafeEqual } from 'node:crypto';

import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { Router } from 'express';

import {
  agentTasks,
  applicationOutcomes,
  applicationStatuses,
  applications,
  db,
  workflowEventTypes,
  workflowEvents,
  workflowJobs,
  workflowRunStatuses,
  workflowRuns,
} from '@applyso/database';

import {
  agentTaskIdempotencyKey,
  applicationIdempotencyKey,
} from '../lib/idempotency';

export { agentTaskIdempotencyKey, applicationIdempotencyKey };

function internalRequestAllowed(token: string | undefined): boolean {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected || !token) return false;
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  if (code === '23505') return true;
  const cause = (error as { cause?: unknown }).cause;
  if (
    cause &&
    typeof cause === 'object' &&
    (cause as { code?: unknown }).code === '23505'
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

  const [job] = await db
    .select({ id: workflowJobs.id })
    .from(workflowJobs)
    .where(
      and(
        eq(workflowJobs.workflowRunId, workflowId),
        eq(workflowJobs.dedupKey, dedupKey),
      ),
    );
  if (!job) return;

  const now = new Date();
  await db
    .update(workflowJobs)
    .set({
      status: update.status === 'queued' ? 'application_queued' : undefined,
      updatedAt: now,
    })
    .where(eq(workflowJobs.id, job.id));

  const applicationValues = {
    status: update.status,
    externalTaskId: update.taskId ?? undefined,
    errorDetail: update.errorDetail ?? null,
    pageUrl: update.pageUrl ?? undefined,
    screenshotPath: update.screenshotPath ?? undefined,
    result: update.result ?? undefined,
    submittedAt: update.status === 'submitted' ? now : undefined,
    completedAt: terminalApplication(update.status)
      ? now
      : update.status === 'queued'
        ? null
        : undefined,
    updatedAt: now,
  };
  await db
    .update(applications)
    .set(applicationValues)
    .where(eq(applications.workflowJobId, job.id));

  if (update.taskId) {
    const [application] = await db
      .select({ id: applications.id })
      .from(applications)
      .where(eq(applications.workflowJobId, job.id));
    if (application) {
      await db
        .update(agentTasks)
        .set({
          externalTaskId: update.taskId,
          status: update.status === 'queued' ? 'queued' : undefined,
          errorDetail: update.status === 'queued' ? null : undefined,
          completedAt: update.status === 'queued' ? null : undefined,
          updatedAt: now,
        })
        .where(
          and(
            eq(agentTasks.workflowRunId, workflowId),
            eq(agentTasks.applicationId, application.id),
          ),
        );
    }
  }
}

export const workflowsRouter = Router();

/**
 * Trusted server-to-server entry point. The web backend has already validated
 * the session and resume/variant ownership before calling this endpoint.
 */
workflowsRouter.post('/internal/start', async (req, res) => {
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
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
    application: typeof applications.$inferSelect;
    workflowStatus: string | null;
  }[];
  try {
    existingRows = await db
      .select({
        application: applications,
        workflowStatus: workflowRuns.status,
      })
      .from(applications)
      .innerJoin(workflowRuns, eq(applications.workflowRunId, workflowRuns.id))
      .where(
        and(
          eq(applications.userId, userId),
          inArray(applications.idempotencyKey, idempotencyKeys),
        ),
      );
  } catch (error) {
    console.error('[workflows] failed to load existing applications:', error);
    res.status(500).json({
      error:
        'Workflow tables are missing or the database is unavailable. Run bun run db:migrate against the API database.',
    });
    return;
  }
  const existingByKey = new Map(
    existingRows.map((row) => [row.application.idempotencyKey, row]),
  );

  const skipped: { dedupKey: string; reason: string }[] = [];
  const toCreate: ApplicationInput[] = [];
  const toReuse: {
    job: ApplicationInput;
    applicationId: string;
    agentTaskKey: string;
  }[] = [];

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
    const runIsActive = !terminalWorkflow(
      existing.workflowStatus as (typeof workflowRunStatuses)[number],
    );
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
      toReuse.push({
        job,
        applicationId: existing.application.id,
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

  const workflowId = randomUUID();
  const now = new Date();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(workflowRuns).values({
        id: workflowId,
        userId,
        resumeId: body.resumeId!,
        status: 'pending',
        request: body.request ?? {},
        startedAt: now,
        updatedAt: now,
      });

      for (const job of toCreate) {
        const [workflowJob] = await tx
          .insert(workflowJobs)
          .values({
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
            updatedAt: now,
          })
          .returning({ id: workflowJobs.id });

        const applicationKey = applicationIdempotencyKey(
          userId,
          job.dedupKey,
          job.resumeVariantId,
        );
        const [application] = await tx
          .insert(applications)
          .values({
            workflowRunId: workflowId,
            workflowJobId: workflowJob.id,
            userId,
            resumeId: body.resumeId!,
            resumeVariantId: job.resumeVariantId,
            status: 'pending',
            idempotencyKey: applicationKey,
            atsType: job.source,
            applicationUrl: job.applicationUrl,
            updatedAt: now,
          })
          .returning({ id: applications.id });

        await tx.insert(agentTasks).values({
          workflowRunId: workflowId,
          applicationId: application.id,
          userId,
          agentName: 'apply-agent',
          taskType: 'submit_application',
          status: 'pending',
          idempotencyKey: agentTaskIdempotencyKey(applicationKey),
          payload: { dedupKey: job.dedupKey },
          updatedAt: now,
        });
      }

      for (const item of toReuse) {
        const [workflowJob] = await tx
          .insert(workflowJobs)
          .values({
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
            updatedAt: now,
          })
          .returning({ id: workflowJobs.id });

        await tx
          .update(applications)
          .set({
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
            updatedAt: now,
          })
          .where(eq(applications.id, item.applicationId));

        await tx
          .update(agentTasks)
          .set({
            workflowRunId: workflowId,
            applicationId: item.applicationId,
            status: 'pending',
            externalTaskId: null,
            errorDetail: null,
            completedAt: null,
            updatedAt: now,
            payload: { dedupKey: item.job.dedupKey },
          })
          .where(
            and(
              eq(agentTasks.userId, userId),
              eq(agentTasks.idempotencyKey, item.agentTaskKey),
            ),
          );
      }

      await tx.insert(workflowEvents).values({
        workflowRunId: workflowId,
        userId,
        eventType: 'workflow.created',
        idempotencyKey: 'created',
        payload: {
          selectedJobCount: toCreate.length + toReuse.length,
          skipped,
        },
        occurredAt: now,
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
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const [workflow] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.id, req.params.workflowId));
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  const jobs = await db
    .select()
    .from(workflowJobs)
    .where(eq(workflowJobs.workflowRunId, workflow.id));
  const applicationRows = await db
    .select()
    .from(applications)
    .where(eq(applications.workflowRunId, workflow.id));

  res.status(200).json({ workflow, jobs, applications: applicationRows });
});

/** Trusted retry lookup for an application and its immutable workflow input. */
workflowsRouter.get(
  '/internal/applications/:applicationId',
  async (req, res) => {
    if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
      res.status(401).json({ error: 'Unauthorized internal workflow request' });
      return;
    }

    const [application] = await db
      .select()
      .from(applications)
      .where(eq(applications.id, req.params.applicationId));
    if (!application) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const [workflowJob] = application.workflowJobId
      ? await db
          .select()
          .from(workflowJobs)
          .where(eq(workflowJobs.id, application.workflowJobId))
      : [];
    const [workflow] = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.id, application.workflowRunId));
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
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal workflow request' });
    return;
  }

  const after =
    typeof req.query.after === 'string' ? new Date(req.query.after) : null;
  if (after && Number.isNaN(after.getTime())) {
    res.status(400).json({ error: 'after must be an ISO-8601 timestamp' });
    return;
  }

  const conditions = after
    ? and(
        eq(workflowEvents.workflowRunId, req.params.workflowId),
        gt(workflowEvents.occurredAt, after),
      )
    : eq(workflowEvents.workflowRunId, req.params.workflowId);
  const events = await db
    .select()
    .from(workflowEvents)
    .where(conditions)
    .orderBy(asc(workflowEvents.occurredAt))
    .limit(100);

  res.status(200).json({ events });
});

/** Trusted orchestrator callback for workflow and application state changes. */
workflowsRouter.post('/internal/:workflowId/status', async (req, res) => {
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
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
  const now = new Date();

  try {
    const [workflow] = await db
      .select({ userId: workflowRuns.userId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, workflowId));
    if (!workflow) {
      res.status(404).json({ error: 'Workflow not found' });
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(workflowRuns)
        .set({
          status: body.status,
          errorDetail: hasString(body.errorDetail)
            ? body.errorDetail
            : undefined,
          completedAt: terminalWorkflow(body.status) ? now : undefined,
          updatedAt: now,
        })
        .where(eq(workflowRuns.id, workflowId));

      for (const update of updates) {
        await updateApplication(workflowId, update);
      }

      await tx
        .insert(workflowEvents)
        .values({
          workflowRunId: workflowId,
          userId: workflow.userId,
          eventType,
          idempotencyKey: hasString(body.eventKey) ? body.eventKey : null,
          payload: body.payload ?? {
            status: body.status,
            applications: updates,
          },
          occurredAt: now,
        })
        .onConflictDoNothing();
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
    if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
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

    const [job] = await db
      .select({ id: workflowJobs.id })
      .from(workflowJobs)
      .where(
        and(
          eq(workflowJobs.workflowRunId, req.params.workflowId),
          eq(workflowJobs.dedupKey, dedupKey),
        ),
      );
    if (!job) {
      res.status(404).json({ error: 'Application not found' });
      return;
    }

    const now = new Date();
    await db
      .update(applications)
      .set({ outcome, updatedAt: now })
      .where(eq(applications.workflowJobId, job.id));

    res.status(200).json({ ok: true, outcome });
  },
);
