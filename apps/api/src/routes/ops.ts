import { Router } from 'express';

import { prisma } from '@applyso/database';

import { evaluateAlerts } from '../lib/ops/alerts';
import { requireServiceToken } from '../lib/service-token';

export const opsInternalRouter = Router();

opsInternalRouter.use(requireServiceToken);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

// POST /v1/internal/ops/heartbeat — idempotent upsert on service name.
opsInternalRouter.post('/heartbeat', async (req, res) => {
  const body = asRecord(req.body);
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  if (!service || service.length > 100) {
    res.status(400).json({ error: 'service is required (max 100 chars)' });
    return;
  }
  const status = body.status === 'degraded' ? 'degraded' : 'ok';
  const version =
    typeof body.version === 'string' && body.version.length <= 100
      ? body.version
      : null;
  try {
    const row = await prisma.serviceHeartbeat.upsert({
      where: { service },
      create: { service, status, version, meta: asRecord(body.meta) as never },
      update: { status, version, meta: asRecord(body.meta) as never },
    });
    res.status(200).json({
      service: row.service,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (error) {
    console.error('[ops] heartbeat failed', error);
    res.status(500).json({ error: 'heartbeat failed' });
  }
});

// POST /v1/internal/ops/metrics — batch of gauge/counter samples.
opsInternalRouter.post('/metrics', async (req, res) => {
  const body = asRecord(req.body);
  const service = typeof body.service === 'string' ? body.service.trim() : '';
  if (!service || service.length > 100) {
    res.status(400).json({ error: 'service is required (max 100 chars)' });
    return;
  }
  const rawMetrics = Array.isArray(body.metrics) ? body.metrics : [];
  const samples = rawMetrics
    .map((entry) => asRecord(entry))
    .filter(
      (entry) =>
        typeof entry.metric === 'string' &&
        entry.metric.length > 0 &&
        typeof entry.value === 'number' &&
        Number.isFinite(entry.value),
    )
    .slice(0, 50)
    .map((entry) => ({
      service,
      metric: String(entry.metric),
      value: Number(entry.value),
      meta: asRecord(entry.meta) as never,
    }));
  if (samples.length === 0) {
    res.status(400).json({ error: 'metrics must be a non-empty array of {metric, value}' });
    return;
  }
  try {
    await prisma.metricSample.createMany({ data: samples });
    res.status(200).json({ stored: samples.length });
  } catch (error) {
    console.error('[ops] metrics ingest failed', error);
    res.status(500).json({ error: 'metrics ingest failed' });
  }
});

// POST /v1/internal/ops/evaluate — run the alert evaluator now (cron upgrade path:
// point a Railway cron service at this instead of the in-process interval).
opsInternalRouter.post('/evaluate', async (req, res) => {
  const result = await evaluateAlerts();
  res.status(result.evaluated ? 200 : 500).json(result);
});
