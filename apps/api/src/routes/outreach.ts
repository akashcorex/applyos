import { Router } from 'express';

import { prisma } from '@applyso/database';

import { serviceRequestAllowed } from '../lib/service-token';

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const outreachRouter = Router();

/** Trusted audit write after an opt-in email is actually handed to a provider. */
outreachRouter.post('/internal/emails', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  if (
    !hasString(body.userId) ||
    !hasString(body.toAddress) ||
    !hasString(body.subject) ||
    !hasString(body.provider) ||
    !hasString(body.status)
  ) {
    res.status(400).json({ error: 'Invalid outreach email payload' });
    return;
  }

  const row = await prisma.outreachEmail.create({
    data: {
      userId: body.userId,
      applicationId: hasString(body.applicationId)
        ? (body.applicationId as string)
        : null,
      toAddress: body.toAddress as string,
      subject: body.subject as string,
      provider: body.provider as string,
      status: body.status as string,
      errorDetail: hasString(body.errorDetail)
        ? (body.errorDetail as string)
        : null,
      sentAt: body.status === 'sent' ? new Date() : null,
    },
    select: { id: true },
  });

  res.status(201).json({ id: row.id });
});
