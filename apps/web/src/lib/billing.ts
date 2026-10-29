import type {
  BillingAddOnPack,
  BillingInterval,
  BillingPlan,
} from '@applyso/validation';

export interface BillingCycleSummary {
  start: string;
  end: string;
  included: number;
  bonus: number;
  submitted: number;
  remaining: number;
  limit: number;
}

export interface BillingInvoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  createdAt: string | null;
  paymentMethod: string | null;
}

export interface BillingMe {
  plan: BillingPlan | 'free';
  interval: BillingInterval | null;
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  hasCustomerPortal: boolean;
  cycle: BillingCycleSummary;
  invoices: BillingInvoice[];
}

export const PLAN_TIER_NAMES = {
  free: 'Rookie',
  starter: 'Scout',
  pro: 'Ace',
  power: 'Conqueror',
} as const;

export function planLabel(plan: BillingMe['plan']): string {
  return PLAN_TIER_NAMES[plan];
}

export function upgradeTargetLabel(plan: BillingMe['plan']): string {
  if (plan === 'free') return PLAN_TIER_NAMES.starter;
  if (plan === 'starter') return PLAN_TIER_NAMES.pro;
  return PLAN_TIER_NAMES.power;
}

export function statusLabel(status: string): string {
  if (status === 'active') return 'ACTIVE';
  if (status === 'free') return 'FREE';
  if (status === 'on_hold') return 'ON HOLD';
  if (status === 'cancelled') return 'CANCELLED';
  if (status === 'expired') return 'EXPIRED';
  if (status === 'failed') return 'FAILED';
  return status.toUpperCase();
}

export async function fetchBillingMe(): Promise<BillingMe | null> {
  try {
    const res = await fetch('/api/billing/me', { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as BillingMe;
  } catch {
    return null;
  }
}

export async function startCheckout(input: {
  plan?: BillingPlan;
  interval?: BillingInterval;
  couponCode?: string;
  addOnPack?: BillingAddOnPack;
}): Promise<{ checkoutUrl?: string; error?: string }> {
  const res = await fetch('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    checkoutUrl?: string;
    error?: string;
  };
  if (!res.ok) return { error: data.error ?? 'Failed to start checkout' };
  return data;
}

export async function startPortal(): Promise<{
  portalUrl?: string;
  error?: string;
}> {
  const res = await fetch('/api/billing/portal', { method: 'POST' });
  const data = (await res.json().catch(() => ({}))) as {
    portalUrl?: string;
    error?: string;
  };
  if (!res.ok) return { error: data.error ?? 'Failed to open portal' };
  return data;
}
