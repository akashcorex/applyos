import DodoPayments from 'dodopayments';

import {
  billingAddOnPacks,
  billingIntervals,
  billingPlans,
  type BillingAddOnPack,
  type BillingInterval,
  type BillingPlan,
} from '@applyso/validation';

const PRODUCT_ENV: Record<BillingPlan, Record<BillingInterval, string>> = {
  starter: {
    monthly: 'DODO_PRODUCT_STARTER_MONTHLY',
    quarterly: 'DODO_PRODUCT_STARTER_QUARTERLY',
    annual: 'DODO_PRODUCT_STARTER_ANNUAL',
  },
  pro: {
    monthly: 'DODO_PRODUCT_PRO_MONTHLY',
    quarterly: 'DODO_PRODUCT_PRO_QUARTERLY',
    annual: 'DODO_PRODUCT_PRO_ANNUAL',
  },
  power: {
    monthly: 'DODO_PRODUCT_POWER_MONTHLY',
    quarterly: 'DODO_PRODUCT_POWER_QUARTERLY',
    annual: 'DODO_PRODUCT_POWER_ANNUAL',
  },
};

const ADD_ON_ENV: Record<BillingAddOnPack, string> = {
  plus_50: 'DODO_PRODUCT_ADDON_PLUS_50',
  plus_150: 'DODO_PRODUCT_ADDON_PLUS_150',
};

let envWarningShown = false;

export function dodoEnvironment(): 'test_mode' | 'live_mode' {
  const raw = process.env.DODO_ENVIRONMENT?.trim().toLowerCase();
  if (!raw) {
    if (!envWarningShown) {
      envWarningShown = true;
      console.warn(
        '[billing] DODO_ENVIRONMENT is unset — defaulting to test_mode. Set it to "live" in production.',
      );
    }
    return 'test_mode';
  }
  return raw === 'live' ? 'live_mode' : 'test_mode';
}

export function getDodoClient(): DodoPayments {
  const bearerToken = process.env.DODO_API_KEY;
  if (!bearerToken) {
    throw new Error('DODO_API_KEY is not configured');
  }
  return new DodoPayments({
    bearerToken,
    webhookKey: process.env.DODO_WEBHOOK_SECRET,
    environment: dodoEnvironment(),
  });
}

export function productIdForPlan(
  plan: BillingPlan,
  interval: BillingInterval,
): string {
  const value = process.env[PRODUCT_ENV[plan][interval]]?.trim();
  if (!value) {
    throw new Error(`Missing ${PRODUCT_ENV[plan][interval]}`);
  }
  return value;
}

export function productIdForAddOn(pack: BillingAddOnPack): string {
  const value = process.env[ADD_ON_ENV[pack]]?.trim();
  if (!value) {
    throw new Error(`Missing ${ADD_ON_ENV[pack]}`);
  }
  return value;
}

export function planFromProductId(
  productId: string | null | undefined,
): { plan: BillingPlan; interval: BillingInterval } | null {
  if (!productId) return null;
  for (const plan of billingPlans) {
    for (const interval of billingIntervals) {
      const configured = process.env[PRODUCT_ENV[plan][interval]]?.trim();
      if (configured && configured === productId) {
        return { plan, interval };
      }
    }
  }
  return null;
}

export function addOnFromProductId(
  productId: string | null | undefined,
): BillingAddOnPack | null {
  if (!productId) return null;
  for (const pack of billingAddOnPacks) {
    const configured = process.env[ADD_ON_ENV[pack]]?.trim();
    if (configured && configured === productId) return pack;
  }
  return null;
}

export function billingReturnUrl(status: 'success' | 'cancelled'): string {
  const webUrl = (process.env.WEB_URL ?? 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
  return `${webUrl}/dashboard/settings/billing?status=${status}`;
}
