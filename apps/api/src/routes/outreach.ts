import { timingSafeEqual } from 'node:crypto';

import { Router } from 'express';

import { db, outreachEmails } from '@applyso/database';

function internalRequestAllowed(token: string | undefined): boolean {
  const expected = process.env.AGENT_SERVICE_TOKEN;
  if (!expected || !token) return false;
  const expectedBuf = Buffer.from(expected);
  const tokenBuf = Buffer.from(token);
  if (expectedBuf.length !== tokenBuf.length) return false;
  return timingSafeEqual(expectedBuf, tokenBuf);
}

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const outreachRouter = Router();

/** Trusted audit write after an opt-in email is actually handed to a provider. */
outreachRouter.post('/internal/emails', async (req, res) => {
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
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

  const [row] = await db
    .insert(outreachEmails)
    .values({
      userId: body.userId,
      applicationId: hasString(body.applicationId) ? body.applicationId : null,
      toAddress: body.toAddress,
      subject: body.subject,
      provider: body.provider,
      status: body.status,
      errorDetail: hasString(body.errorDetail) ? body.errorDetail : null,
      sentAt: body.status === 'sent' ? new Date() : null,
    })
    .returning({ id: outreachEmails.id });

  res.status(201).json({ id: row.id });
});
