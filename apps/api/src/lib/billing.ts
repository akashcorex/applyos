import { prisma } from '@applyso/database';
import {
  ADD_ON_PACK_BONUS,
  FREE_APPLICATION_QUOTA,
  billingAddOnPacks,
  billingIntervals,
  billingPlans,
  billingSubscriptionStatuses,
  type BillingAddOnPack,
  type BillingInterval,
  type BillingPlan,
  type BillingSubscriptionStatus,
} from '@applyso/validation';

import { addOnFromProductId, getDodoClient, planFromProductId } from './dodo';
import {
  addBonusApplications,
  getOrCreateUsageCycle,
  latestActiveSubscription,
  remainingInCycle,
  resetCycleForSubscription,
} from './quota';

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseWebhookDate(value: unknown, fallback: Date): Date {
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 1e12 ? value * 1000 : value;
    const parsed = new Date(ms);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

function metadataOf(data: Record<string, unknown>): Record<string, string> {
  const raw = asRecord(data.metadata);
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

function productIdOf(data: Record<string, unknown>): string | null {
  return (
    asString(data.product_id) ??
    asString(asRecord(data.product).product_id) ??
    asString(asRecord(data.product).id)
  );
}

function customerIdOf(data: Record<string, unknown>): string | null {
  const customer = asRecord(data.customer);
  return (
    asString(data.customer_id) ??
    asString(customer.customer_id) ??
    asString(customer.id)
  );
}

function subscriptionIdOf(data: Record<string, unknown>): string | null {
  return asString(data.subscription_id) ?? asString(data.subscriptionId);
}

function isBillingPlan(value: string | null): value is BillingPlan {
  return Boolean(value && (billingPlans as readonly string[]).includes(value));
}

function isBillingInterval(value: string | null): value is BillingInterval {
  return Boolean(
    value && (billingIntervals as readonly string[]).includes(value),
  );
}

function isAddOnPack(value: string | null): value is BillingAddOnPack {
  return Boolean(
    value && (billingAddOnPacks as readonly string[]).includes(value),
  );
}

function isSubscriptionStatus(
  value: string | null,
): value is BillingSubscriptionStatus {
  return Boolean(
    value && (billingSubscriptionStatuses as readonly string[]).includes(value),
  );
}

async function resolveUserId(
  data: Record<string, unknown>,
): Promise<string | null> {
  const metadata = metadataOf(data);
  if (metadata.userId) return metadata.userId;
  const customerId = customerIdOf(data);
  if (!customerId) return null;
  const row = await prisma.billingCustomer.findUnique({
    where: { dodoCustomerId: customerId },
    select: { userId: true },
  });
  return row?.userId ?? null;
}

export async function upsertBillingCustomer(
  userId: string,
  dodoCustomerId: string,
): Promise<void> {
  await prisma.billingCustomer.upsert({
    where: { userId },
    create: { userId, dodoCustomerId },
    update: { dodoCustomerId },
  });
}

async function upsertSubscriptionFromPayload(
  userId: string,
  data: Record<string, unknown>,
  statusOverride?: BillingSubscriptionStatus,
): Promise<void> {
  const subscriptionId = subscriptionIdOf(data);
  if (!subscriptionId) return;

  const metadata = metadataOf(data);
  const productId = productIdOf(data) ?? '';
  const mapped = planFromProductId(productId);
  const plan = isBillingPlan(metadata.plan)
    ? metadata.plan
    : (mapped?.plan ?? null);
  const interval = isBillingInterval(metadata.interval)
    ? metadata.interval
    : (mapped?.interval ?? null);
  if (!plan || !interval) {
    console.error(
      '[billing] subscription event missing plan/interval mapping; subscription not provisioned. product_id=' +
        (productId || 'null'),
    );
    return;
  }

  const now = new Date();
  const periodStart = parseWebhookDate(
    data.current_period_start ?? data.previous_billing_date,
    now,
  );
  const periodEnd = parseWebhookDate(
    data.current_period_end ?? data.next_billing_date,
    new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
  );
  const payloadStatus = asString(data.status);
  const status =
    statusOverride ??
    (isSubscriptionStatus(payloadStatus) ? payloadStatus : 'active');
  const cancelAtPeriodEnd =
    data.cancel_at_next_billing_date === true ||
    data.cancel_at_period_end === true ||
    status === 'cancelled';

  await prisma.subscription.upsert({
    where: { dodoSubscriptionId: subscriptionId },
    create: {
      userId,
      dodoSubscriptionId: subscriptionId,
      plan,
      interval,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      dodoProductId: productId,
    },
    update: {
      plan,
      interval,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd,
      dodoProductId: productId || undefined,
    },
  });

  if (status === 'active') {
    await resetCycleForSubscription({
      userId,
      plan,
      periodStart,
      periodEnd,
    });
  }
}

export async function handleDodoWebhookEvent(
  type: string,
  data: Record<string, unknown>,
): Promise<void> {
  const customerId = customerIdOf(data);
  const userId = await resolveUserId(data);
  if (userId && customerId) {
    await upsertBillingCustomer(userId, customerId);
  }

  switch (type) {
    case 'checkout.session.completed':
      return;
    case 'subscription.active':
    case 'subscription.renewed':
      if (userId) {
        await upsertSubscriptionFromPayload(userId, data, 'active');
      } else {
        console.error(
          '[billing] subscription.active event could not resolve a user; plan not provisioned. data.customer_id=' +
            (customerId ?? 'null'),
        );
      }
      return;
    case 'subscription.on_hold':
      if (userId) await upsertSubscriptionFromPayload(userId, data, 'on_hold');
      return;
    case 'subscription.cancelled':
      if (userId) {
        await upsertSubscriptionFromPayload(userId, data, 'cancelled');
      }
      return;
    case 'subscription.expired':
      if (userId) await upsertSubscriptionFromPayload(userId, data, 'expired');
      return;
    case 'subscription.failed':
      if (userId) await upsertSubscriptionFromPayload(userId, data, 'failed');
      return;
    case 'payment.succeeded': {
      if (!userId) {
        console.error(
          '[billing] payment.succeeded could not resolve a user; bonus not granted. customer_id=' +
            (customerIdOf(data) ?? 'null'),
        );
        return;
      }
      const metadata = metadataOf(data);
      const pack = isAddOnPack(metadata.addOnPack)
        ? metadata.addOnPack
        : addOnFromProductId(productIdOf(data));
      if (pack) {
        await addBonusApplications(userId, ADD_ON_PACK_BONUS[pack]);
      } else {
        console.error(
          '[billing] payment.succeeded could not map to a plan/add-on; bonus not granted. product_id=' +
            (productIdOf(data) ?? 'null'),
        );
      }
      return;
    }
    default:
      return;
  }
}

export async function listRecentInvoices(dodoCustomerId: string) {
  try {
    const client = getDodoClient();
    const page = await client.payments.list({
      customer_id: dodoCustomerId,
      page_size: 10,
    });
    const items = Array.isArray(page.items) ? page.items : [];
    return items.map((payment) => {
      const row = payment as {
        payment_id?: string;
        total_amount?: number;
        currency?: string;
        status?: string;
        created_at?: string;
      };
      return {
        id: row.payment_id ?? '',
        amount: row.total_amount ?? 0,
        currency: (row.currency ?? 'INR').toUpperCase(),
        status: row.status ?? 'unknown',
        createdAt: row.created_at ?? null,
      };
    });
  } catch (error) {
    console.warn('[billing] failed to list invoices:', error);
    return [];
  }
}

function isMissingRelation(error: unknown): boolean {
  return (error as { code?: string }).code === 'P2021';
}

function freeBillingSummary() {
  const now = new Date();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    plan: 'free' as const,
    interval: null,
    status: 'free',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    hasCustomerPortal: false,
    cycle: {
      start: now.toISOString(),
      end: end.toISOString(),
      included: FREE_APPLICATION_QUOTA,
      bonus: 0,
      submitted: 0,
      remaining: FREE_APPLICATION_QUOTA,
      limit: FREE_APPLICATION_QUOTA,
    },
    invoices: [] as {
      id: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: string | null;
    }[],
  };
}

export async function billingSummaryForUser(userId: string) {
  try {
    const [subscription, cycle, customer] = await Promise.all([
      latestActiveSubscription(userId),
      getOrCreateUsageCycle(userId),
      prisma.billingCustomer.findUnique({ where: { userId } }),
    ]);

    const invoices = customer
      ? await listRecentInvoices(customer.dodoCustomerId)
      : [];
    const remaining = remainingInCycle(cycle);
    const plan = (subscription?.plan as BillingPlan | undefined) ?? 'free';

    return {
      plan,
      interval: (subscription?.interval as BillingInterval | undefined) ?? null,
      status: subscription?.status ?? 'free',
      cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? false,
      currentPeriodEnd: subscription?.currentPeriodEnd.toISOString() ?? null,
      hasCustomerPortal: Boolean(customer),
      cycle: {
        start: cycle.cycleStart.toISOString(),
        end: cycle.cycleEnd.toISOString(),
        included: cycle.includedApplications,
        bonus: cycle.bonusApplications,
        submitted: cycle.submittedCount,
        remaining,
        limit: cycle.includedApplications + cycle.bonusApplications,
      },
      invoices,
    };
  } catch (error) {
    if (isMissingRelation(error)) {
      console.warn('[billing] billing tables missing; returning free plan');
      return freeBillingSummary();
    }
    throw error;
  }
}
