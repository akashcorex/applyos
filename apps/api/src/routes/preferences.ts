import { Router } from 'express';

import { prisma } from '@applyso/database';

import { serviceRequestAllowed } from '../lib/service-token';

function hasString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const defaultPreferences = {
  postApplyLinkedinConnectEnabled: false,
  autoSubmitEnabled: false,
};

export const preferencesRouter = Router();

preferencesRouter.get('/internal/:userId', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  if (!hasString(req.params.userId)) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const row = await prisma.userPreferences.findUnique({
      where: { userId: req.params.userId },
    });

    res.status(200).json({
      userId: req.params.userId,
      ...(row ?? defaultPreferences),
    });
  } catch (error) {
    console.error('[preferences] failed to load user preferences:', error);
    res.status(200).json({
      userId: req.params.userId,
      ...defaultPreferences,
    });
  }
});

preferencesRouter.put('/internal/:userId', async (req, res) => {
  if (!serviceRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  if (!hasString(req.params.userId)) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const body = req.body as {
    postApplyLinkedinConnectEnabled?: unknown;
    autoSubmitEnabled?: unknown;
  };
  try {
    const existing = await prisma.userPreferences.findUnique({
      where: { userId: req.params.userId },
    });

    const nextLinkedin =
      body.postApplyLinkedinConnectEnabled === undefined
        ? (existing?.postApplyLinkedinConnectEnabled ?? false)
        : body.postApplyLinkedinConnectEnabled === true;
    const nextAutoSubmit =
      body.autoSubmitEnabled === undefined
        ? (existing?.autoSubmitEnabled ?? false)
        : body.autoSubmitEnabled === true;

    const row = await prisma.userPreferences.upsert({
      where: { userId: req.params.userId },
      create: {
        userId: req.params.userId,
        postApplyLinkedinConnectEnabled: nextLinkedin,
        autoSubmitEnabled: nextAutoSubmit,
      },
      update: {
        postApplyLinkedinConnectEnabled: nextLinkedin,
        autoSubmitEnabled: nextAutoSubmit,
      },
    });

    res.status(200).json(row);
  } catch (error) {
    console.error('[preferences] failed to save user preferences:', error);
    res.status(503).json({
      error:
        'Preferences table is missing. Run prisma migrate deploy against the API database.',
    });
  }
});
