import { Router } from 'express';

import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';

export const meRouter = Router();

// All routes require authentication; ownership is implicit (session user only).
meRouter.use(requireAuth);

// GET /v1/me — own account (never another user's).
meRouter.get('/', async (req, res) => {
  const me = authUserOf(req);
  const user = await prisma.user.findUnique({
    where: { id: me.id },
    select: {
      id: true,
      email: true,
      name: true,
      emailVerified: true,
      image: true,
      role: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.status(200).json({ user });
});
