import { prisma } from '@applyso/database';

import {
  computeOpsSnapshot,
  type OpsSnapshot,
  QUEUE_SUSTAIN_WINDOW_MS,
} from './snapshot';

export type AlertSeverity = 'CRITICAL' | 'WARNING';

export interface RuleViolation {
  ruleKey: string;
  target: string;
  severity: AlertSeverity;
  summary: string;
  detail: Record<string, unknown>;
}

export interface AlertWebhookPayload {
  source: 'applyos-ops';
  state: 'firing' | 'resolved' | 'test';
  severity: AlertSeverity | 'TEST';
  ruleKey: string;
  target: string;
  summary: string;
  detail: Record<string, unknown>;
  onCall: string;
  firedAt: string;
  text: string;
  content: string;
}

export interface EvaluationResult {
  evaluated: boolean;
  fired: string[];
  resolved: string[];
  error?: string;
}

export const DEFAULT_EXPECTED_SERVICES = [
  'api',
  'ai-orchestrator',
  'job-agent',
  'apply-agent',
  'outreach-agent',
  'resume-agent',
];

export const QUEUE_DEPTH_THRESHOLD = 50;
export const SUCCESS_RATE_MIN_ATTEMPTS = 10;
export const SUCCESS_RATE_THRESHOLD = 0.6;
export const PAYMENT_FAILURE_1H_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MINUTES = 30;

export function expectedServices(): string[] {
  const raw = process.env.OPS_EXPECTED_SERVICES;
  if (!raw) return DEFAULT_EXPECTED_SERVICES;
  const parsed = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : DEFAULT_EXPECTED_SERVICES;
}

function cooldownMs(): number {
  const parsed = Number.parseInt(
    String(process.env.OPS_ALERT_COOLDOWN_MINUTES ?? ''),
    10,
  );
  return (Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_COOLDOWN_MINUTES) * 60 * 1000;
}

function onCallName(): string {
  return process.env.OPS_ON_CALL_NAME ?? 'on-call';
}

/** Rules table (in code, not DB) — G3: down, queue depth, success rate, payment failures. */
export function collectViolations(
  snapshot: OpsSnapshot,
  services: string[] = expectedServices(),
): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const heartbeatByService = new Map(
    snapshot.services.map((service) => [service.service, service]),
  );
  for (const service of services) {
    const heartbeat = heartbeatByService.get(service);
    if (!heartbeat) {
      violations.push({
        ruleKey: 'service_down',
        target: service,
        severity: 'CRITICAL',
        summary: `${service} has never reported a heartbeat`,
        detail: { expected: true, reported: false },
      });
      continue;
    }
    if (heartbeat.stale) {
      violations.push({
        ruleKey: 'service_down',
        target: service,
        severity: 'CRITICAL',
        summary: `${service} heartbeat is stale (${heartbeat.ageSeconds}s old)`,
        detail: { ageSeconds: heartbeat.ageSeconds, lastStatus: heartbeat.status },
      });
    }
  }

  for (const queue of snapshot.queueDepths) {
    if (
      queue.current > QUEUE_DEPTH_THRESHOLD &&
      queue.tenMinAgo !== null &&
      queue.tenMinAgo > QUEUE_DEPTH_THRESHOLD
    ) {
      violations.push({
        ruleKey: 'queue_depth',
        target: `${queue.service}:${queue.metric}`,
        severity: 'WARNING',
        summary: `${queue.service} ${queue.metric} at ${Math.floor(queue.current)} for ${QUEUE_SUSTAIN_WINDOW_MS / 60000}+ min`,
        detail: { current: queue.current, tenMinAgo: queue.tenMinAgo },
      });
    }
  }

  for (const board of snapshot.boards) {
    if (
      board.successRate24h !== null &&
      board.attempts24h >= SUCCESS_RATE_MIN_ATTEMPTS &&
      board.successRate24h < SUCCESS_RATE_THRESHOLD
    ) {
      violations.push({
        ruleKey: 'automation_success_rate',
        target: board.board,
        severity: 'WARNING',
        summary: `${board.board} success rate ${(board.successRate24h * 100).toFixed(0)}% over 24h (${board.submitted24h}/${board.attempts24h})`,
        detail: {
          successRate24h: board.successRate24h,
          submitted24h: board.submitted24h,
          attempts24h: board.attempts24h,
        },
      });
    }
  }

  if (snapshot.paymentFailures.last1h >= PAYMENT_FAILURE_1H_THRESHOLD) {
    violations.push({
      ruleKey: 'payment_failures',
      target: 'global',
      severity: 'CRITICAL',
      summary: `${snapshot.paymentFailures.last1h} payment failures in the last hour`,
      detail: { last1h: snapshot.paymentFailures.last1h },
    });
  }

  return violations;
}

function buildPayload(
  state: AlertWebhookPayload['state'],
  violation: RuleViolation,
  now: Date,
): AlertWebhookPayload {
  const severity =
    state === 'test' ? 'TEST' : (violation.severity as AlertSeverity);
  const summary =
    state === 'resolved'
      ? `RESOLVED — ${violation.summary}`
      : state === 'test'
        ? `[TEST] ${violation.summary}`
        : violation.summary;
  const text = `[ApplyOS][${severity}] ${violation.ruleKey} · ${violation.target} — ${summary} (on-call: ${onCallName()})`;
  return {
    source: 'applyos-ops',
    state,
    severity,
    ruleKey: violation.ruleKey,
    target: violation.target,
    summary,
    detail: violation.detail,
    onCall: onCallName(),
    firedAt: now.toISOString(),
    text,
    content: text,
  };
}

/** POST to ALERT_WEBHOOK_URL (Slack "text" / Discord "content" compatible). Never throws. */
export async function deliverAlert(payload: AlertWebhookPayload): Promise<boolean> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) {
    console.warn(
      `[ops] ALERT_WEBHOOK_URL is not set; ${payload.state} alert ${payload.ruleKey}/${payload.target} not delivered`,
    );
    return false;
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.error(
        `[ops] alert webhook for ${payload.ruleKey}/${payload.target} returned ${res.status}`,
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      `[ops] alert webhook delivery for ${payload.ruleKey}/${payload.target} failed`,
      error,
    );
    return false;
  }
}

function violationKey(ruleKey: string, target: string): string {
  return `${ruleKey}|${target}`;
}

/**
 * Evaluate all rules against a fresh snapshot and drive AlertState:
 * fire (respecting the per rule+target cooldown), then auto-resolve.
 * Never throws — failures are captured in the returned result.
 */
export async function evaluateAlerts(now: Date = new Date()): Promise<EvaluationResult> {
  const result: EvaluationResult = { evaluated: false, fired: [], resolved: [] };
  try {
    const snapshot = await computeOpsSnapshot(now);
    const violations = collectViolations(snapshot);
    const violating = new Set(
      violations.map((violation) => violationKey(violation.ruleKey, violation.target)),
    );
    const states = await prisma.alertState.findMany();
    const stateByKey = new Map(
      states.map((state) => [violationKey(state.ruleKey, state.target), state]),
    );

    for (const violation of violations) {
      const key = violationKey(violation.ruleKey, violation.target);
      const existing = stateByKey.get(key);
      const isOpen = existing?.state === 'open';
      const lastFiredAt = existing?.lastFiredAt ?? null;
      const inCooldown =
        lastFiredAt !== null &&
        now.getTime() - lastFiredAt.getTime() < cooldownMs();
      if (isOpen && inCooldown) continue;

      await deliverAlert(buildPayload('firing', violation, now));
      await prisma.alertState.upsert({
        where: { ruleKey_target: { ruleKey: violation.ruleKey, target: violation.target } },
        create: {
          ruleKey: violation.ruleKey,
          target: violation.target,
          severity: violation.severity,
          state: 'open',
          lastFiredAt: now,
          meta: violation.detail as never,
        },
        update: {
          severity: violation.severity,
          state: 'open',
          lastFiredAt: now,
          resolvedAt: null,
          meta: violation.detail as never,
        },
      });
      result.fired.push(key);
    }

    for (const state of states) {
      if (state.state !== 'open') continue;
      const key = violationKey(state.ruleKey, state.target);
      if (violating.has(key)) continue;
      await prisma.alertState.update({
        where: { ruleKey_target: { ruleKey: state.ruleKey, target: state.target } },
        data: { state: 'resolved', resolvedAt: now },
      });
      await deliverAlert(
        buildPayload(
          'resolved',
          {
            ruleKey: state.ruleKey,
            target: state.target,
            severity: state.severity === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
            summary: `${state.ruleKey} on ${state.target} cleared`,
            detail: (state.meta && typeof state.meta === 'object'
              ? (state.meta as Record<string, unknown>)
              : {}),
          },
          now,
        ),
      );
      result.resolved.push(key);
    }

    result.evaluated = true;
    return result;
  } catch (error) {
    console.error('[ops] alert evaluation failed', error);
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

/** Fire a clearly-labeled TEST alert through the real channel (G3 gate lever). */
export async function sendTestAlert(
  actorEmail: string,
  now: Date = new Date(),
): Promise<{ delivered: boolean; reason?: string }> {
  if (!process.env.ALERT_WEBHOOK_URL) {
    return { delivered: false, reason: 'ALERT_WEBHOOK_URL is not configured' };
  }
  const violation: RuleViolation = {
    ruleKey: 'test-alert',
    target: 'channel',
    severity: 'WARNING',
    summary: `Gate G3 delivery test triggered by ${actorEmail}`,
    detail: { triggeredBy: actorEmail },
  };
  const delivered = await deliverAlert(buildPayload('test', violation, now));
  return delivered
    ? { delivered: true }
    : { delivered: false, reason: 'Webhook delivery failed (see API logs)' };
}
