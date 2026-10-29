import { Router } from 'express';

import { prisma } from '@applyso/database';

export const healthRouter = Router();

// GET /v1/health — liveness + DB round-trip; 503 when the database is down.
healthRouter.get('/health', async (req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      db: 'ok',
      dbLatencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[health] database check failed', error);
    res.status(503).json({ status: 'degraded', db: 'unavailable' });
  }
});
