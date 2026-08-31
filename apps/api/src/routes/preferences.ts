import { timingSafeEqual } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { Router } from 'express';

import { db, userPreferences } from '@applyso/database';

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

const defaultPreferences = {
  postApplyLinkedinConnectEnabled: false,
  emailOutreachEnabled: false,
  autoSubmitEnabled: false,
};

export const preferencesRouter = Router();

preferencesRouter.get('/internal/:userId', async (req, res) => {
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  if (!hasString(req.params.userId)) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  try {
    const [row] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.params.userId));

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
  if (!internalRequestAllowed(req.header('x-agent-service-token'))) {
    res.status(401).json({ error: 'Unauthorized internal request' });
    return;
  }
  if (!hasString(req.params.userId)) {
    res.status(400).json({ error: 'userId is required' });
    return;
  }

  const body = req.body as {
    postApplyLinkedinConnectEnabled?: unknown;
    emailOutreachEnabled?: unknown;
    autoSubmitEnabled?: unknown;
  };
  const now = new Date();
  try {
    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, req.params.userId));

    const nextLinkedin =
      body.postApplyLinkedinConnectEnabled === undefined
        ? (existing?.postApplyLinkedinConnectEnabled ?? false)
        : body.postApplyLinkedinConnectEnabled === true;
    const nextEmail =
      body.emailOutreachEnabled === undefined
        ? (existing?.emailOutreachEnabled ?? false)
        : body.emailOutreachEnabled === true;
    const nextAutoSubmit =
      body.autoSubmitEnabled === undefined
        ? (existing?.autoSubmitEnabled ?? false)
        : body.autoSubmitEnabled === true;

    const values = {
      userId: req.params.userId,
      postApplyLinkedinConnectEnabled: nextLinkedin,
      emailOutreachEnabled: nextEmail,
      autoSubmitEnabled: nextAutoSubmit,
      updatedAt: now,
    };

    const [row] = await db
      .insert(userPreferences)
      .values(values)
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          postApplyLinkedinConnectEnabled:
            values.postApplyLinkedinConnectEnabled,
          emailOutreachEnabled: values.emailOutreachEnabled,
          autoSubmitEnabled: values.autoSubmitEnabled,
          updatedAt: now,
        },
      })
      .returning();

    res.status(200).json(row);
  } catch (error) {
    console.error('[preferences] failed to save user preferences:', error);
    res.status(503).json({
      error:
        'Preferences table is missing. Run bun run db:migrate against the API database.',
    });
  }
});
