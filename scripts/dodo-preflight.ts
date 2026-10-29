/**
 * Dodo billing preflight (G1 runbook step 0).
 * Verifies env config and live/test product prices against the plan table in
 * packages/validation/src/billing.ts before any real checkout is attempted.
 * Run: bun scripts/dodo-preflight.ts   (exits 1 on any failure or mismatch)
 */
import DodoPayments from 'dodopayments';

import {
  ADD_ON_PACK_BONUS,
  PLAN_PRICES_INR,
} from '../packages/validation/src/billing';
import {
  billingAddOnPacks,
  billingIntervals,
  billingPlans,
} from '../packages/validation/src/enums';

interface DodoPriceShape {
  currency?: string;
  price?: number;
  discount?: number;
  payment_frequency_interval?: string;
}

interface DodoProductShape {
  name?: string;
  is_recurring?: boolean;
  price?: DodoPriceShape;
}

const PRODUCT_ENV: {
  label: string;
  env: string;
  expectedInr: number | null;
}[] = [];
for (const plan of billingPlans) {
  for (const interval of billingIntervals) {
    PRODUCT_ENV.push({
      label: `${plan}/${interval}`,
      env: `DODO_PRODUCT_${plan.toUpperCase()}_${interval.toUpperCase()}`,
      expectedInr: PLAN_PRICES_INR[plan][interval],
    });
  }
}
for (const pack of billingAddOnPacks) {
  PRODUCT_ENV.push({
    label: `addon ${pack} (+${ADD_ON_PACK_BONUS[pack]})`,
    env: `DODO_PRODUCT_ADDON_${pack.replace('plus_', 'PLUS_')}`,
    expectedInr: null,
  });
}

let failures = 0;
const fail = (message: string) => {
  failures += 1;
  console.error(`  ✗ ${message}`);
};
const ok = (message: string) => console.log(`  ✓ ${message}`);

console.log('== Dodo billing preflight ==\n');

const environment = process.env.DODO_ENVIRONMENT?.trim().toLowerCase();
if (environment === 'live') {
  console.log('mode: LIVE — real charges possible\n');
} else {
  if (!environment) {
    console.warn('  ! DODO_ENVIRONMENT unset — API defaults to test_mode');
  }
  console.log(`mode: ${environment || 'test (default)'}\n`);
}

if (!process.env.DODO_API_KEY?.trim()) {
  fail('DODO_API_KEY is not set');
} else {
  ok(
    `DODO_API_KEY set (${process.env.DODO_API_KEY.startsWith('dk_live') ? 'live' : 'test/non-live prefix'})`,
  );
}

if (!process.env.DODO_WEBHOOK_SECRET?.trim()) {
  console.warn(
    '  ! DODO_WEBHOOK_SECRET not set — webhooks will 503. Register the endpoint in Dodo (Developer → Webhooks) for this environment.',
  );
} else {
  ok(
    'DODO_WEBHOOK_SECRET set (endpoint must match this environment in Dodo dashboard)',
  );
}

const missing = PRODUCT_ENV.filter((row) => !process.env[row.env]?.trim());
for (const row of missing) fail(`${row.env} is not set`);

if (
  !process.env.DODO_API_KEY?.trim() ||
  missing.length === PRODUCT_ENV.length
) {
  console.error('\nNot enough configuration to query Dodo. Exiting.');
  process.exit(1);
}

const client = new DodoPayments({
  bearerToken: process.env.DODO_API_KEY.trim(),
  environment: environment === 'live' ? 'live_mode' : 'test_mode',
});

console.log('\nproduct checks (price in INR; Dodo stores paise):');
for (const row of PRODUCT_ENV) {
  const productId = process.env[row.env]?.trim();
  if (!productId) continue;
  try {
    const product = (await client.products.retrieve(
      productId,
    )) as unknown as DodoProductShape;
    const price = product.price?.price;
    const discount = product.price?.discount ?? 0;
    const currency = (product.price?.currency ?? 'INR').toUpperCase();
    if (currency !== 'INR') {
      fail(
        `${row.label}: product currency is ${currency}, expected INR (${productId})`,
      );
      continue;
    }
    if (discount !== 0) {
      fail(
        `${row.label}: product has a ${discount}% discount baked in (${productId})`,
      );
      continue;
    }
    const inr = typeof price === 'number' ? price / 100 : null;
    if (inr === null) {
      fail(`${row.label}: product has no price set (${productId})`);
      continue;
    }
    if (row.expectedInr === null) {
      ok(
        `${row.label}: ${product.name ?? '(unnamed)'} → ₹${inr} — record this price for the billing UI + pricing page`,
      );
    } else if (inr !== row.expectedInr) {
      fail(
        `${row.label}: Dodo price ₹${inr} ≠ expected ₹${row.expectedInr} (${productId})`,
      );
    } else {
      ok(`${row.label}: ₹${inr} matches the plan table (${productId})`);
    }
  } catch (error) {
    fail(
      `${row.label}: could not retrieve product ${productId} — ${(error as Error).message}`,
    );
  }
}

console.log('');
if (failures > 0) {
  console.error(
    `${failures} problem(s) — fix before running the G1 live checklist.`,
  );
  process.exit(1);
}
console.log(
  'All configured products exist in Dodo and prices match the plan table.',
);
console.log('Next: docs/g1-dodo-billing-runbook.md steps 1–6.');
