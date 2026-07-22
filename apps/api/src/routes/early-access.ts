import { Router } from 'express';

import { db } from '@org/database';
import { earlyAccess } from '@org/database';

export const earlyAccessRouter = Router();

earlyAccessRouter.use((_req, _res, next) => next());

function isValidEmail(value: unknown): value is string {
  if (!value || typeof value !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('unique constraint');
}

earlyAccessRouter.get('/count', async (_req, res) => {
  try {
    const count = await db.$count(earlyAccess);
    return res.status(200).json({ count });
  } catch {
    return res.status(500).json({ error: 'Something went wrong' });
  }
});

earlyAccessRouter.post('/', async (req, res) => {
  const { email } = req.body;

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    await db.insert(earlyAccess).values({ email: email.trim().toLowerCase() });
    return res.status(201).json({ message: 'Subscribed successfully' });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return res.status(409).json({ error: 'Email already subscribed' });
    }
    return res.status(500).json({ error: 'Something went wrong' });
  }
});