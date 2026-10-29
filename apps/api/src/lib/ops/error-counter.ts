import { prisma } from '@applyso/database';

import type { Request, Response, NextFunction } from 'express';

const routeCounts = new Map<string, number>();
let total5xx = 0;

/** Count 5xx responses per route in memory; flushed to MetricSample every minute. */
export function httpErrorTracker() {
  return function trackHttpErrors(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    res.on('finish', () => {
      if (res.statusCode < 500) return;
      const route = `${req.method} ${req.baseUrl}${req.path}`;
      routeCounts.set(route, (routeCounts.get(route) ?? 0) + 1);
      total5xx += 1;
    });
    next();
  };
}

export function errorCounterSnapshot(): { total: number; routes: Record<string, number> } {
  return { total: total5xx, routes: Object.fromEntries(routeCounts) };
}

/**
 * Flush the 5xx counter to MetricSample, self-heartbeat the API, and prune
 * samples older than 14 days. Runs on a 60s interval; never throws.
 */
export async function flushApiOpsMetrics(): Promise<void> {
  const { total, routes } = errorCounterSnapshot();
  routeCounts.clear();
  total5xx = 0;
  try {
    await Promise.all([
      prisma.metricSample.create({
        data: {
          service: 'api',
          metric: 'http_5xx',
          value: total,
          meta: { routes } as never,
        },
      }),
      prisma.serviceHeartbeat.upsert({
        where: { service: 'api' },
        create: { service: 'api', status: 'ok' },
        update: { status: 'ok' },
      }),
      prisma.metricSample.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
      }),
    ]);
  } catch (error) {
    console.error('[ops] api metrics flush failed', error);
  }
}
