import { Router } from 'express';

import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';

export const meRouter = Router();

// All routes require authentication; ownership is implicit (session user only).
meRouter.use(requireAuth);

// GET /v1/me — own account (never another user's) + onboarding state.
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
      profile: { select: { isConfirmed: true } },
      _count: {
        select: {
          // Any resume ever uploaded (archived rows included) — archiving
          // must not push a confirmed user back through onboarding.
          resumeFiles: {},
        },
      },
    },
  });
  if (!user) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  const hasResume = user._count.resumeFiles > 0;
  const hasProfile = user.profile !== null;
  const profileConfirmed = user.profile?.isConfirmed ?? false;
  const { profile: _profile, _count, ...account } = user;
  res.status(200).json({
    user: account,
    onboarding: {
      hasResume,
      hasProfile,
      profileConfirmed,
      onboardingComplete: hasResume && profileConfirmed,
    },
  });
});
