import { Router } from 'express';

import { db, earlyAccessEmail } from '@applyso/database';

function validateEmail(raw: unknown): { email: string } | { error: string } {
  if (!raw || typeof raw !== 'string') {
    return { error: 'email is required' };
  }

  const normalized = raw.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalized)) {
    return { error: 'invalid email address' };
  }

  return { email: normalized };
}

async function registerEmail(email: string): Promise<
  | { ok: true; alreadyRegistered: boolean; email: string }
  | { ok: false; error: string }
> {
  try {
    const [row] = await db
      .insert(earlyAccessEmail)
      .values({ email })
      .onConflictDoNothing({ target: earlyAccessEmail.email })
      .returning();

    return { ok: true, alreadyRegistered: !row, email };
  } catch (err) {
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
  const message = result.alreadyRegistered ? 'already registered' : 'registered';
  res.status(status).json({ message, email: result.email });
});

/**
 * GET /v1/early-access/count
 * Total number of early-access sign-ups (public social-proof).
 */
earlyAccessRouter.get('/count', async (_req, res) => {
  try {
    const rows = await db.select().from(earlyAccessEmail);
    res.status(200).json({ count: rows.length });
  } catch (err) {
    console.error('[early-access] count error:', err);
    res.status(500).json({ error: 'failed to get count' });
  }
});
