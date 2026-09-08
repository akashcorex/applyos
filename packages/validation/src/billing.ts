import * as z from 'zod';

import {
  billingAddOnPacks,
  billingAddOnPackSchema,
  billingIntervalSchema,
  billingIntervals,
  billingPlanSchema,
  billingPlans,
} from './enums';
import { nonEmptyString } from './primitives';

export const FREE_APPLICATION_QUOTA = 25;

export const PLAN_APPLICATION_QUOTAS = {
  starter: 150,
  pro: 400,
  power: 1000,
} as const;

export const ADD_ON_PACK_BONUS = {
  plus_50: 50,
  plus_150: 150,
} as const;

export const PLAN_PRICES_INR = {
  starter: { monthly: 499, quarterly: 1199, annual: 3999 },
  pro: { monthly: 999, quarterly: 2099, annual: 7999 },
  power: { monthly: 2199, quarterly: 5299, annual: 17799 },
} as const;

export const PLAN_INTERVAL_SAVINGS = {
  starter: { quarterly: 20, annual: 33 },
  pro: { quarterly: 30, annual: 33 },
  power: { quarterly: 20, annual: 33 },
} as const;

export const billingCheckoutSchema = z
  .object({
    plan: billingPlanSchema.optional(),
    interval: billingIntervalSchema.optional(),
    couponCode: z
      .string({ error: 'couponCode must be a string' })
      .trim()
      .min(1, { error: 'couponCode is required' })
      .max(64, { error: 'couponCode must be at most 64 characters' })
      .optional(),
    addOnPack: billingAddOnPackSchema.optional(),
  })
  .refine(
    (value) =>
      Boolean(value.addOnPack) ||
      (Boolean(value.plan) && Boolean(value.interval)),
    { error: 'Either addOnPack or plan and interval is required' },
  );

export type BillingCheckoutInput = z.output<typeof billingCheckoutSchema>;

export const compiledBillingCheckoutSchema = z.compile(billingCheckoutSchema);

export const billingCouponSchema = z.object({
  couponCode: nonEmptyString(64, 'couponCode'),
});

export type BillingCoupon = z.output<typeof billingCouponSchema>;

export function includedQuotaForPlan(
  plan: (typeof billingPlans)[number] | 'free' | null | undefined,
): number {
  if (!plan || plan === 'free') return FREE_APPLICATION_QUOTA;
  return PLAN_APPLICATION_QUOTAS[plan];
}

export function bonusForAddOnPack(
  pack: (typeof billingAddOnPacks)[number],
): number {
  return ADD_ON_PACK_BONUS[pack];
}

export function monthlyEquivalentInr(
  plan: (typeof billingPlans)[number],
  interval: (typeof billingIntervals)[number],
): number {
  const price = PLAN_PRICES_INR[plan][interval];
  if (interval === 'monthly') return price;
  if (interval === 'quarterly') return Math.round(price / 3);
  return Math.round(price / 12);
}
