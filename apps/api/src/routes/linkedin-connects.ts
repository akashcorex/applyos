import { Router } from 'express';

import { linkedinConnectStatuses, prisma } from '@applyso/database';

import { requireServiceToken } from '../lib/service-token';

type ConnectStatus = (typeof linkedinConnectStatuses)[number];

interface BulkConnectItem {
  userId: string;
  jobId: string;
  companyName: string;
  profileUrl: string;
  profileName: string;
  headline?: string | null;
  status: ConnectStatus;
  errorDetail?: string | null;
  sentAt?: string | null;
}

function isConnectStatus(value: unknown): value is ConnectStatus {
  return (
    typeof value === 'string' &&
    (linkedinConnectStatuses as readonly string[]).includes(value)
  );
}

function parseBulkItem(raw: unknown): BulkConnectItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.userId !== 'string' ||
    typeof o.jobId !== 'string' ||
    typeof o.companyName !== 'string' ||
    typeof o.profileUrl !== 'string' ||
    typeof o.profileName !== 'string' ||
    !isConnectStatus(o.status)
  ) {
    return null;
  }
  return {
    userId: o.userId,
    jobId: o.jobId,
    companyName: o.companyName,
    profileUrl: o.profileUrl,
    profileName: o.profileName,
    headline: typeof o.headline === 'string' ? o.headline : null,
    status: o.status,
    errorDetail: typeof o.errorDetail === 'string' ? o.errorDetail : null,
    sentAt: typeof o.sentAt === 'string' ? o.sentAt : null,
  };
}

export const linkedinConnectsRouter = Router();

linkedinConnectsRouter.use(requireServiceToken);

/**
 * POST /v1/linkedin-connects/bulk
 * Upsert connection invite rows reported by apply-agent.
 */
linkedinConnectsRouter.post('/bulk', async (req, res) => {
  const body = req.body as { connects?: unknown };
  if (!Array.isArray(body?.connects) || body.connects.length === 0) {
    res.status(400).json({ error: 'connects must be a non-empty array' });
    return;
  }

  const items: BulkConnectItem[] = [];
  for (const raw of body.connects) {
    const item = parseBulkItem(raw);
    if (!item) {
      res.status(400).json({ error: 'invalid connect item in bulk payload' });
      return;
    }
    items.push(item);
  }

  const now = new Date();
  const results = [];

  for (const item of items) {
    const sentAt =
      item.sentAt != null
        ? new Date(item.sentAt)
        : item.status === 'sent'
          ? now
          : null;

    const row = await prisma.linkedinConnect.upsert({
      where: {
        userId_jobId_profileUrl: {
          userId: item.userId,
          jobId: item.jobId,
          profileUrl: item.profileUrl,
        },
      },
      create: {
        userId: item.userId,
        jobId: item.jobId,
        companyName: item.companyName,
        profileUrl: item.profileUrl,
        profileName: item.profileName,
        headline: item.headline ?? null,
        status: item.status,
        errorDetail: item.errorDetail ?? null,
        sentAt,
      },
      update: {
        companyName: item.companyName,
        profileName: item.profileName,
        headline: item.headline ?? null,
        status: item.status,
        errorDetail: item.errorDetail ?? null,
        sentAt,
      },
    });

    results.push(row);
  }

  res.status(200).json({ connects: results, count: results.length });
});

/**
 * GET /v1/linkedin-connects?userId=&jobId=
 */
linkedinConnectsRouter.get('/', async (req, res) => {
  const userId = typeof req.query.userId === 'string' ? req.query.userId : null;
  const jobId = typeof req.query.jobId === 'string' ? req.query.jobId : null;

  if (!userId) {
    res.status(400).json({ error: 'userId query param is required' });
    return;
  }

  const rows = await prisma.linkedinConnect.findMany({
    where: jobId ? { userId, jobId } : { userId },
  });

  res.status(200).json({ connects: rows, count: rows.length });
});
