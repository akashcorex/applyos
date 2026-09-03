import { Router } from 'express';

import { prisma } from '@applyso/database';
import {
  earlyAccessSubscribeSchema,
  firstErrorMessage,
} from '@applyso/validation';

function validateEmail(raw: unknown): { email: string } | { error: string } {
  const result = earlyAccessSubscribeSchema.safeParse({ email: raw });
  if (!result.success) {
    return { error: firstErrorMessage(result.error) };
  }

  return { email: result.data.email };
}

async function registerEmail(
  email: string,
): Promise<
  | { ok: true; alreadyRegistered: boolean; email: string }
  | { ok: false; error: string }
> {
  try {
    const existing = await prisma.earlyAccessEmail.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return { ok: true, alreadyRegistered: true, email };
    }
    await prisma.earlyAccessEmail.create({ data: { email } });
    return { ok: true, alreadyRegistered: false, email };
  } catch (err) {
    // Unique race: another request inserted the same email concurrently.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: unknown }).code === 'P2002'
    ) {
      return { ok: true, alreadyRegistered: true, email };
    }
    console.error('[early-access] insert error:', err);
    return { ok: false, error: 'failed to register email' };
  }
}

export const earlyAccessRouter = Router();

/**
 * POST /v1/early-access
 * Register an email for early access.
 */
// fallow-ignore-next-line complexity
earlyAccessRouter.post('/', async (req, res) => {
  const validation = validateEmail(req.body?.email);
  if ('error' in validation) {
    res.status(400).json({ error: validation.error });
    return;
  }

  const result = await registerEmail(validation.email);
  if (!result.ok) {
    res.status(500).json({ error: result.error });
    return;
  }

  const status = result.alreadyRegistered ? 200 : 201;
  const message = result.alreadyRegistered
    ? 'already registered'
    : 'registered';
  res.status(status).json({ message, email: result.email });
});

/**
 * GET /v1/early-access/count
 * Total number of early-access sign-ups (public social-proof).
 */
earlyAccessRouter.get('/count', async (_req, res) => {
  try {
    const count = await prisma.earlyAccessEmail.count();
    res.status(200).json({ count });
  } catch (err) {
    console.error('[early-access] count error:', err);
    res.status(500).json({ error: 'failed to get count' });
  }
});
