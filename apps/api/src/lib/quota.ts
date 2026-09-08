import { prisma } from '@applyso/database';
import {
  FREE_APPLICATION_QUOTA,
  PLAN_APPLICATION_QUOTAS,
  type BillingPlan,
} from '@applyso/validation';

const CYCLE_MS = 30 * 24 * 60 * 60 * 1000;

const QUOTA_RESERVED_STATUSES = [
  'pending',
  'queued',
  'starting',
  'running',
  'waiting_for_human',
  'resuming',
  'browser_disconnected',
] as const;

export class QuotaExceededError extends Error {
  readonly reason = 'quota_exceeded' as const;
  readonly remaining = 0;
  readonly addOnCheckout = true;

  constructor() {
    super('Application quota exceeded');
    this.name = 'QuotaExceededError';
  }
}

export function quotaExceededBody() {
  return {
    error: 'Application quota exceeded',
    reason: 'quota_exceeded' as const,
    remaining: 0,
    addOnCheckout: true,
  };
}

export async function latestActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: 'active' },
    orderBy: { currentPeriodEnd: 'desc' },
  });
}

export async function getOrCreateUsageCycle(userId: string) {
  const now = new Date();
  const open = await prisma.usageCycle.findMany({
    where: {
      userId,
      cycleStart: { lte: now },
      cycleEnd: { gt: now },
    },
    orderBy: [{ includedApplications: 'desc' }, { cycleStart: 'desc' }],
  });
  if (open[0]) return open[0];

  const subscription = await latestActiveSubscription(userId);
  const included = subscription
    ? (PLAN_APPLICATION_QUOTAS[subscription.plan as BillingPlan] ??
      FREE_APPLICATION_QUOTA)
    : FREE_APPLICATION_QUOTA;
  const cycleStart =
    subscription && subscription.currentPeriodEnd > now
      ? subscription.currentPeriodStart
      : now;
  const cycleEnd =
    subscription && subscription.currentPeriodEnd > now
      ? subscription.currentPeriodEnd
      : new Date(now.getTime() + CYCLE_MS);

  return prisma.usageCycle.create({
    data: {
      userId,
      cycleStart,
      cycleEnd,
      includedApplications: included,
      bonusApplications: 0,
      submittedCount: 0,
    },
  });
}

export function remainingInCycle(cycle: {
  includedApplications: number;
  bonusApplications: number;
  submittedCount: number;
}): number {
  return Math.max(
    0,
    cycle.includedApplications + cycle.bonusApplications - cycle.submittedCount,
  );
}

export async function assertCanStartApplications(
  userId: string,
  requestedCount: number,
): Promise<void> {
  if (requestedCount <= 0) return;
  const cycle = await getOrCreateUsageCycle(userId);
  const inFlight = await prisma.application.count({
    where: {
      userId,
      status: { in: [...QUOTA_RESERVED_STATUSES] },
      createdAt: { gte: cycle.cycleStart },
    },
  });
  const remaining = remainingInCycle(cycle);
  if (
    cycle.submittedCount + inFlight + requestedCount >
    cycle.includedApplications + cycle.bonusApplications
  ) {
    throw new QuotaExceededError();
  }
  if (requestedCount > remaining) {
    throw new QuotaExceededError();
  }
}

export async function incrementSubmittedCount(userId: string): Promise<void> {
  const cycle = await getOrCreateUsageCycle(userId);
  await prisma.usageCycle.update({
    where: { id: cycle.id },
    data: { submittedCount: { increment: 1 }, updatedAt: new Date() },
  });
}

export async function addBonusApplications(
  userId: string,
  bonus: number,
): Promise<void> {
  if (bonus <= 0) return;
  const cycle = await getOrCreateUsageCycle(userId);
  await prisma.usageCycle.update({
    where: { id: cycle.id },
    data: { bonusApplications: { increment: bonus }, updatedAt: new Date() },
  });
}

export async function resetCycleForSubscription(input: {
  userId: string;
  plan: BillingPlan;
  periodStart: Date;
  periodEnd: Date;
}): Promise<void> {
  const included = PLAN_APPLICATION_QUOTAS[input.plan];
  const existing = await prisma.usageCycle.findFirst({
    where: { userId: input.userId, cycleStart: input.periodStart },
  });
  if (existing) {
    await prisma.usageCycle.update({
      where: { id: existing.id },
      data: {
        cycleEnd: input.periodEnd,
        includedApplications: included,
        updatedAt: new Date(),
      },
    });
    return;
  }
  await prisma.usageCycle.create({
    data: {
      userId: input.userId,
      cycleStart: input.periodStart,
      cycleEnd: input.periodEnd,
      includedApplications: included,
      bonusApplications: 0,
      submittedCount: 0,
    },
  });
}
