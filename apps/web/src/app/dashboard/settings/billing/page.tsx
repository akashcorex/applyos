'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { analytics } from '@applyso/analytics';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@applyso/ui/card';
import { Check } from '@applyso/ui/icons';
import { Input } from '@applyso/ui/input';
import {
  ADD_ON_PACK_BONUS,
  FREE_APPLICATION_QUOTA,
  PLAN_APPLICATION_QUOTAS,
  PLAN_INTERVAL_SAVINGS,
  PLAN_PRICES_INR,
  billingIntervals,
  billingPlans,
  monthlyEquivalentInr,
  type BillingInterval,
  type BillingPlan,
} from '@applyso/validation';

import {
  fetchBillingMe,
  planLabel,
  startCheckout,
  startPortal,
  statusLabel,
  type BillingMe,
} from '@/lib/billing';

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

const PLAN_COPY: Record<
  BillingPlan,
  { description: string; features: string[] }
> = {
  starter: {
    description: 'For focused searches that still need real submissions.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.starter} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
  pro: {
    description: 'Higher volume for active job searches.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.pro} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
  power: {
    description: 'Maximum throughput when you are applying at scale.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.power} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
};

function BillingPlansPage() {
  const searchParams = useSearchParams();
  const [interval, setInterval] = useState<BillingInterval>('monthly');
  const [couponCode, setCouponCode] = useState('');
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setNotice(
        'Payment received. Your plan updates as soon as Dodo confirms it.',
      );
    } else if (status === 'cancelled') {
      setNotice('Checkout cancelled. No charge was made.');
    }
    void fetchBillingMe().then(setBilling);
  }, [searchParams]);

  const atQuota = useMemo(() => {
    if (!billing) return false;
    return billing.cycle.remaining === 0;
  }, [billing]);

  async function checkoutPlan(plan: BillingPlan) {
    setBusy(`${plan}:${interval}`);
    setError(null);
    analytics.track(
      'plan_upgrade_clicked',
      { target_plan: plan, billing_cycle: interval },
      { feature: 'settings_billing' },
    );
    const result = await startCheckout({
      plan,
      interval,
      couponCode: couponCode.trim() || undefined,
    });
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    setError(result.error ?? 'Failed to start checkout');
    setBusy(null);
  }

  async function checkoutAddOn(pack: 'plus_50' | 'plus_150') {
    setBusy(pack);
    setError(null);
    const result = await startCheckout({
      addOnPack: pack,
      couponCode: couponCode.trim() || undefined,
    });
    if (result.checkoutUrl) {
      window.location.href = result.checkoutUrl;
      return;
    }
    setError(result.error ?? 'Failed to start checkout');
    setBusy(null);
  }

  async function openPortal() {
    setBusy('portal');
    setError(null);
    const result = await startPortal();
    if (result.portalUrl) {
      window.location.href = result.portalUrl;
      return;
    }
    setError(result.error ?? 'Failed to open portal');
    setBusy(null);
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 text-slate-900 dark:text-[#f1f3f9]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
            Pay for the applications. Not the tool.
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5">
            Every paid tier is the full product. Only volume differs. Quota
            resets every 30 days.
          </p>
        </div>

        <div className="flex items-center self-start sm:self-auto p-1 rounded-[8px] bg-slate-100 dark:bg-[#141518] border border-slate-200 dark:border-[#22242a]">
          {billingIntervals.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors capitalize ${
                interval === option
                  ? 'bg-white dark:bg-[#22242a] text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {notice ? (
        <p className="text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-[8px] px-3 py-2">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              Applications this cycle
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f3f9]">
                {billing?.cycle.submitted ?? '—'}
              </span>
              <span className="text-xs text-slate-500 dark:text-[#8a8f9d] font-medium">
                / {billing?.cycle.limit ?? FREE_APPLICATION_QUOTA}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              {billing
                ? `${billing.cycle.remaining} remaining · submitted applications only`
                : 'Loading usage…'}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              Current plan
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f3f9]">
                {billing ? planLabel(billing.plan) : '—'}
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {billing ? statusLabel(billing.status) : ''}
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              {billing?.interval
                ? `${billing.interval} · ${FREE_APPLICATION_QUOTA} free apps included before you pay`
                : `${FREE_APPLICATION_QUOTA} free submitted applications. No card required.`}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-3">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              Coupon
            </span>
            <Input
              value={couponCode}
              onChange={(event) => setCouponCode(event.target.value)}
              placeholder="Optional code"
              className="h-8 text-xs"
            />
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              Applied at Dodo checkout. You can also type a code there.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {billingPlans.map((plan) => {
          const price = PLAN_PRICES_INR[plan][interval];
          const save =
            interval === 'monthly'
              ? null
              : PLAN_INTERVAL_SAVINGS[plan][interval];
          const current =
            billing?.plan === plan &&
            billing.interval === interval &&
            billing.status === 'active';
          const popular = plan === 'pro';
          return (
            <Card
              key={plan}
              className={`rounded-[12px] transition-all ${
                popular
                  ? 'border-indigo-500/60 bg-indigo-50/20 dark:bg-[#181a22] shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-[#282a32] bg-white dark:bg-[#16171b]'
              }`}
            >
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-semibold text-slate-900 dark:text-[#f1f3f9]">
                      {planLabel(plan)}
                    </span>
                    {popular ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20"
                      >
                        Most popular
                      </Badge>
                    ) : null}
                  </div>
                  {current ? (
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 status-glow-emerald" />
                  ) : null}
                </div>
                <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                  {PLAN_COPY[plan].description}
                </CardDescription>
                <div className="pt-3 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
                    {formatInr(price)}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                    / {interval}
                  </span>
                </div>
                {interval !== 'monthly' ? (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    {formatInr(monthlyEquivalentInr(plan, interval))}/mo
                    {save ? ` · save ${save}%` : ''}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-5">
                <ul className="space-y-2 text-xs text-slate-700 dark:text-[#d1d5db] border-t border-slate-200 dark:border-[#22242a] pt-4">
                  {PLAN_COPY[plan].features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  disabled={current || busy !== null}
                  onClick={() => void checkoutPlan(plan)}
                  className={`w-full rounded-[6px] text-xs font-semibold ${
                    current
                      ? 'bg-slate-100 dark:bg-[#22242a] text-slate-500 dark:text-[#8a8f9d] border border-slate-200 dark:border-[#2e313a] cursor-default'
                      : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200'
                  }`}
                >
                  {current
                    ? 'Current plan'
                    : busy === `${plan}:${interval}`
                      ? 'Redirecting…'
                      : 'Get started'}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {atQuota ? (
        <Card className="rounded-[12px] border-amber-500/40">
          <CardHeader>
            <span className="text-sm font-semibold">
              Buy extra applications
            </span>
            <CardDescription className="text-xs">
              Add-on packs apply to your current 30-day cycle. Cards stay on
              Dodo hosted checkout.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              disabled={busy !== null}
              variant="outline"
              className="rounded-[6px] text-xs"
              onClick={() => void checkoutAddOn('plus_50')}
            >
              {busy === 'plus_50'
                ? 'Redirecting…'
                : `+${ADD_ON_PACK_BONUS.plus_50} applications`}
            </Button>
            <Button
              disabled={busy !== null}
              variant="outline"
              className="rounded-[6px] text-xs"
              onClick={() => void checkoutAddOn('plus_150')}
            >
              {busy === 'plus_150'
                ? 'Redirecting…'
                : `+${ADD_ON_PACK_BONUS.plus_150} applications`}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {billing?.hasCustomerPortal ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={busy !== null}
            onClick={() => void openPortal()}
            className="rounded-[6px] text-xs"
          >
            {busy === 'portal' ? 'Opening…' : 'Manage payment & cancel'}
          </Button>
        </div>
      ) : null}

      <p className="text-[11px] text-center text-slate-500 dark:text-[#8a8f9d]">
        Cancel any time. {FREE_APPLICATION_QUOTA} free submitted applications.
        You pay only for jobs actually submitted.
      </p>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingPlansPage />
    </Suspense>
  );
}
