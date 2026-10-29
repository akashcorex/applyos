import { prisma } from '@applyso/database';

export const HEARTBEAT_STALE_SECONDS = 180;
export const QUEUE_SUSTAIN_WINDOW_MS = 10 * 60 * 1000;

export interface HeartbeatStatus {
  service: string;
  status: string;
  version: string | null;
  meta: Record<string, unknown>;
  updatedAt: string;
  ageSeconds: number;
  stale: boolean;
}

export interface QueueDepthStatus {
  service: string;
  metric: string;
  current: number;
  tenMinAgo: number | null;
}

export interface BoardSuccessRate {
  board: string;
  attempts24h: number;
  submitted24h: number;
  successRate24h: number | null;
  attempts14d: number;
  submitted14d: number;
  successRate14d: number | null;
}

export interface OpsSnapshot {
  generatedAt: string;
  services: HeartbeatStatus[];
  queueDepths: QueueDepthStatus[];
  boards: BoardSuccessRate[];
  paymentFailures: { last1h: number; last24h: number };
  api: { http5xxLastHour: number };
}

const TERMINAL_STATUSES = ['submitted', 'failed', 'timed_out'] as const;
const PAYMENT_FAILURE_EVENTS = ['payment.failed', 'subscription.failed'] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function loadHeartbeats(now: Date): Promise<HeartbeatStatus[]> {
  const rows = await prisma.serviceHeartbeat.findMany({
    orderBy: { service: 'asc' },
  });
  return rows.map((row) => {
    const ageSeconds = Math.max(
      0,
      Math.floor((now.getTime() - row.updatedAt.getTime()) / 1000),
    );
    return {
      service: row.service,
      status: row.status,
      version: row.version,
      meta: asRecord(row.meta),
      updatedAt: row.updatedAt.toISOString(),
      ageSeconds,
      stale: ageSeconds > HEARTBEAT_STALE_SECONDS,
    };
  });
}

async function loadQueueDepths(now: Date): Promise<QueueDepthStatus[]> {
  const rows = await prisma.metricSample.findMany({
    where: {
      metric: { startsWith: 'queue.' },
      createdAt: { gte: new Date(now.getTime() - 15 * 60 * 1000) },
    },
    orderBy: { createdAt: 'asc' },
  });
  const byKey = new Map<string, QueueDepthStatus>();
  const cutoff = now.getTime() - QUEUE_SUSTAIN_WINDOW_MS;
  for (const row of rows) {
    const key = `${row.service}|${row.metric}`;
    const age = now.getTime() - row.createdAt.getTime();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        service: row.service,
        metric: row.metric,
        current: row.value,
        tenMinAgo: age >= QUEUE_SUSTAIN_WINDOW_MS ? row.value : null,
      });
      continue;
    }
    existing.current = row.value;
    // rows are oldest-first: remember the newest sample at or before the cutoff
    if (row.createdAt.getTime() <= cutoff) existing.tenMinAgo = row.value;
  }
  return [...byKey.values()].sort(
    (a, b) => a.service.localeCompare(b.service) || a.metric.localeCompare(b.metric),
  );
}

interface BoardCounts {
  attempts: number;
  submitted: number;
}

function boardCountIndex(
  rows: { atsType: string | null; status: string; count: number }[],
): Map<string, BoardCounts> {
  const index = new Map<string, BoardCounts>();
  for (const row of rows) {
    const board = row.atsType ?? 'unknown';
    const entry = index.get(board) ?? { attempts: 0, submitted: 0 };
    entry.attempts += row.count;
    if (row.status === 'submitted') entry.submitted += row.count;
    index.set(board, entry);
  }
  return index;
}

async function loadBoardSuccessRates(now: Date): Promise<BoardSuccessRate[]> {
  const [rows24h, rows14d] = await Promise.all([
    prisma.application.groupBy({
      by: ['atsType', 'status'],
      where: {
        status: { in: [...TERMINAL_STATUSES] },
        updatedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
    prisma.application.groupBy({
      by: ['atsType', 'status'],
      where: {
        status: { in: [...TERMINAL_STATUSES] },
        updatedAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
      },
      _count: { _all: true },
    }),
  ]);
  const day = boardCountIndex(
    rows24h.map((row) => ({
      atsType: row.atsType,
      status: row.status,
      count: row._count._all,
    })),
  );
  const fortnight = boardCountIndex(
    rows14d.map((row) => ({
      atsType: row.atsType,
      status: row.status,
      count: row._count._all,
    })),
  );
  const boards = new Set([...day.keys(), ...fortnight.keys()]);
  return [...boards].sort().map((board) => {
    const d = day.get(board) ?? { attempts: 0, submitted: 0 };
    const f = fortnight.get(board) ?? { attempts: 0, submitted: 0 };
    return {
      board,
      attempts24h: d.attempts,
      submitted24h: d.submitted,
      successRate24h: d.attempts > 0 ? d.submitted / d.attempts : null,
      attempts14d: f.attempts,
      submitted14d: f.submitted,
      successRate14d: f.attempts > 0 ? f.submitted / f.attempts : null,
    };
  });
}

async function loadPaymentFailures(now: Date): Promise<{
  last1h: number;
  last24h: number;
}> {
  const [last1h, last24h] = await Promise.all([
    prisma.processedWebhook.count({
      where: {
        eventType: { in: [...PAYMENT_FAILURE_EVENTS] },
        processedAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
      },
    }),
    prisma.processedWebhook.count({
      where: {
        eventType: { in: [...PAYMENT_FAILURE_EVENTS] },
        processedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    }),
  ]);
  return { last1h, last24h };
}

async function loadApiErrors(now: Date): Promise<{ http5xxLastHour: number }> {
  const aggregate = await prisma.metricSample.aggregate({
    _sum: { value: true },
    where: {
      service: 'api',
      metric: 'http_5xx',
      createdAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) },
    },
  });
  return { http5xxLastHour: aggregate._sum.value ?? 0 };
}

/** Derived ops metrics: heartbeats + queue depth + per-board success + payment failures. */
export async function computeOpsSnapshot(now: Date = new Date()): Promise<OpsSnapshot> {
  const [services, queueDepths, boards, paymentFailures, api] = await Promise.all([
    loadHeartbeats(now),
    loadQueueDepths(now),
    loadBoardSuccessRates(now),
    loadPaymentFailures(now),
    loadApiErrors(now),
  ]);
  return {
    generatedAt: now.toISOString(),
    services,
    queueDepths,
    boards,
    paymentFailures,
    api,
  };
}
