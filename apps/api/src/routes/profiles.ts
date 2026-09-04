import { Router } from 'express';

import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';
import { validateProfileInput } from '../lib/phase1-validation';
import { validateEnrichedProfileInput } from '../lib/phase2-validation';

export const profilesRouter = Router();

profilesRouter.use(requireAuth);

async function trackProfileEvent(
  eventName: string,
  userId: string,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        eventName,
        feature: 'profile',
        userId,
        anonymousId: 'server_anonymous',
        sessionId: 'server_session',
        source: 'server',
        properties: {},
        context: { platform: 'node' } as never,
        environment:
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
        timestamp: new Date(),
      },
    });
  } catch {
    // best-effort
  }
}

// GET /v1/profiles/me — own profile only.
profilesRouter.get('/me', async (req, res) => {
  const me = authUserOf(req);
  const profile = await prisma.profile.findUnique({
    where: { userId: me.id },
  });
  res.status(200).json({ profile });
});

// PUT /v1/profiles/me — create or update own profile (upsert by userId).
// Accepts Phase 1 scalar fields plus Phase 2 enriched sections (skills,
// education, experience, projects, certifications, achievements, headline,
// email). Saving never confirms: confirmation is an explicit review step
// (POST /me/confirm). Unconfirmed profiles stay updatable by new resume
// extractions; confirmed ones are canonical and never overwritten.
profilesRouter.put('/me', async (req, res) => {
  const me = authUserOf(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const legacy = validateProfileInput(body);
  if (!legacy.ok) {
    res.status(400).json({ error: legacy.error });
    return;
  }
  const enriched = validateEnrichedProfileInput(body);
  if (!enriched.ok) {
    res.status(400).json({ error: enriched.error });
    return;
  }
  const data = { ...legacy.data, ...enriched.data } as Record<string, unknown>;
  // Strip enriched-only keys that are absent so PATCH-style partial saves
  // don't null out sections unintentionally — validateEnrichedProfileInput
  // already omits absent keys; legacy.data does the same.
  const existing = await prisma.profile.findUnique({
    where: { userId: me.id },
    select: { id: true },
  });
  const profile = await prisma.profile.upsert({
    where: { userId: me.id },
    create: {
      userId: me.id,
      ...data,
    },
    update: { ...data },
  });
  await trackProfileEvent(
    existing ? 'profile_updated' : 'profile_created',
    me.id,
  );
  res.status(200).json({ profile });
});

// POST /v1/profiles/me/confirm — review step: mark extracted data confirmed
// without changing fields. 404 when no profile exists yet.
profilesRouter.post('/me/confirm', async (req, res) => {
  const me = authUserOf(req);
  const existing = await prisma.profile.findUnique({
    where: { userId: me.id },
  });
  if (!existing) {
    res.status(404).json({ error: 'No profile to confirm' });
    return;
  }
  const profile = await prisma.profile.update({
    where: { userId: me.id },
    data: { isConfirmed: true, confirmedAt: new Date() },
  });
  await trackProfileEvent('profile_confirmed', me.id);
  res.status(200).json({ profile });
});
