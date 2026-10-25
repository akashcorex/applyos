'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';

import { useSearchParams } from 'next/navigation';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ExternalLink,
  Flame,
  Zap,
} from '@applyso/ui/icons';
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

import { NoticeBar } from '@/components/dashboard/PageChrome';
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
    description: 'Your job search starts here.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.starter} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
  pro: {
    description: 'Lock in and level up your search.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.pro} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
  power: {
    description: 'Full send on your job hunt.',
    features: [
      `${PLAN_APPLICATION_QUOTAS.power} submitted applications / 30 days`,
      'Hosted checkout — card stays with Dodo',
      'Cancel any time',
    ],
  },
};

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'active'
      ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
      : status === 'free'
        ? 'border-border bg-neutral-900/60 text-zinc-400'
        : 'border-amber-500/25 bg-amber-500/10 text-amber-400';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] ${tone}`}
    >
      {status === 'active' ? (
        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
      ) : null}
      {statusLabel(status)}
    </span>
  );
}

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
    <div className="w-full bg-background text-foreground">
      {notice ? (
        <NoticeBar tone="success" icon={CheckCircle2}>
          {notice}
        </NoticeBar>
      ) : null}
      {error ? (
        <NoticeBar tone="danger" icon={AlertTriangle}>
          {error}
        </NoticeBar>
      ) : null}

      {/* ── 1. Page Header Bar (Full-bleed) ───────────────────── */}
      <div className="w-full border-b border-border bg-background px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground font-sans">
            Pay for applications. Not the tool.
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Every paid tier is the full product — only the volume differs. Quota
            resets every 30 days.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 self-start sm:self-auto rounded-[6px] border border-border bg-neutral-900/40 p-1">
          {billingIntervals.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setInterval(option)}
              aria-pressed={interval === option}
              className={`h-7 px-3 rounded-[4px] text-xs font-mono capitalize transition-colors select-none ${
                interval === option
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* ── 2. Billing KPI Strip ──────────────────────────────── */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Applications this cycle
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {billing?.cycle.submitted ?? '—'}
            <span className="text-sm font-medium text-zinc-500">
              {' '}
              / {billing?.cycle.limit ?? FREE_APPLICATION_QUOTA}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            {billing
              ? `${billing.cycle.remaining} remaining · submitted only`
              : 'loading cycle…'}
          </p>
        </div>

        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Current plan
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-semibold text-foreground font-sans">
              {billing ? planLabel(billing.plan) : '—'}
            </span>
            {billing ? <StatusPill status={billing.status} /> : null}
          </div>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            {billing?.interval
              ? `${billing.interval} · ${FREE_APPLICATION_QUOTA} free apps included before you pay`
              : `${FREE_APPLICATION_QUOTA} free submitted applications · no card required`}
          </p>
        </div>

        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Coupon
          </p>
          <Input
            value={couponCode}
            onChange={(event) => setCouponCode(event.target.value)}
            placeholder="Optional code"
            className="mt-1.5 h-8 w-full max-w-44 text-xs font-mono bg-neutral-900/40 border-border"
          />
          <p className="mt-1 text-[11px] font-mono text-zinc-500">
            applied at Dodo checkout
          </p>
        </div>
      </div>

      {/* ── 3. Plans ──────────────────────────────────────────── */}
      <section aria-label="Plans" className="w-full border-b border-border">
        <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            <h2 className="text-sm font-medium text-primary">Plans & Quotas</h2>
          </div>
          <span className="text-xs font-mono text-zinc-500">
            submitted applications per 30 days
          </span>
        </div>

        <div className="w-full grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
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
              <div
                key={plan}
                className={`relative flex flex-col px-6 sm:px-10 py-8 sm:py-10 ${
                  popular
                    ? 'bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent dark:from-emerald-500/20 dark:via-teal-500/10 dark:to-transparent'
                    : plan === 'power'
                      ? 'bg-gradient-to-b from-muted/70 via-muted/20 to-transparent'
                      : 'bg-transparent'
                }`}
              >
                {popular ? (
                  <>
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent"
                    />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-10 top-0 h-6 bg-gradient-to-b from-emerald-300/20 to-transparent blur-md"
                    />
                  </>
                ) : null}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-xl font-semibold tracking-tight text-foreground">
                    {planLabel(plan)}
                  </span>
                  {popular ? (
                    <span className="rounded-[4px] bg-neutral-200 px-2 py-1 text-[10px] font-mono font-medium uppercase tracking-wider text-zinc-900">
                      Most popular
                    </span>
                  ) : null}
                  {current ? (
                    <span className="rounded-[4px] border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                      Current
                    </span>
                  ) : null}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {PLAN_COPY[plan].description}
                </p>
                <div className="mt-6 flex items-baseline gap-2.5">
                  <span className="text-4xl sm:text-5xl font-semibold tabular-nums tracking-tight text-foreground font-sans">
                    {formatInr(price)}
                  </span>
                  <span className="text-sm font-mono text-zinc-500">
                    / {interval}
                  </span>
                </div>
                {interval !== 'monthly' ? (
                  <p className="mt-1.5 text-xs font-mono text-emerald-400">
                    {formatInr(monthlyEquivalentInr(plan, interval))}/mo
                    {save ? ` · save ${save}%` : ''}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs font-mono text-zinc-500">
                    billed every 30 days
                  </p>
                )}
                <ul className="mt-8 flex-1 space-y-3.5 border-t border-border pt-6 text-sm">
                  {PLAN_COPY[plan].features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <Check className="mt-0.5 size-4 text-emerald-400 shrink-0" />
                      <span className="text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-8">
                  <Button
                    disabled={current || busy !== null}
                    onClick={() => void checkoutPlan(plan)}
                    className={`w-full h-10 rounded-[6px] text-sm font-mono font-medium ${
                      current
                        ? 'border border-border bg-neutral-900/40 text-zinc-500 cursor-default'
                        : 'bg-foreground text-background hover:bg-zinc-200'
                    }`}
                  >
                    {current
                      ? 'Current plan'
                      : busy === `${plan}:${interval}`
                        ? 'Redirecting…'
                        : 'Get started'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 4. Top-up Packs ──────────────────────────────────── */}
      {atQuota ? (
        <section
          aria-label="Top-up packs"
          className="w-full border-b border-border"
        >
          <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5">
            <div className="flex items-center gap-2">
              <Flame className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-primary">
                Buy Extra Applications
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              bonus packs · Dodo hosted checkout
            </span>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {(
              [
                ['plus_50', ADD_ON_PACK_BONUS.plus_50],
                ['plus_150', ADD_ON_PACK_BONUS.plus_150],
              ] as const
            ).map(([pack, bonus]) => (
              <div
                key={pack}
                className="px-6 sm:px-8 py-4 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    +{bonus} applications
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Applies to your current 30-day cycle
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => void checkoutAddOn(pack)}
                  className="h-8 rounded-[6px] text-xs font-mono font-medium"
                >
                  {busy === pack ? 'Redirecting…' : 'Buy pack'}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── 5. Manage Subscription ───────────────────────────── */}
      {billing?.hasCustomerPortal ? (
        <section
          aria-label="Manage subscription"
          className="w-full border-b border-border"
        >
          <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5">
            <div className="flex items-center gap-2">
              <ExternalLink className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-primary">
                Manage Subscription
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              invoices · card · cancellation
            </span>
          </div>

          <div className="px-6 sm:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Change payment method, download invoices, or cancel your
              subscription in the Dodo customer portal.
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void openPortal()}
              className="self-start sm:self-auto h-8 rounded-[6px] text-xs font-mono font-medium"
            >
              {busy === 'portal' ? 'Opening…' : 'Open billing portal'}
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── 6. Footer Note ────────────────────────────────────── */}
      <p className="w-full border-b border-border bg-background px-6 sm:px-8 py-4 text-center text-[11px] font-mono text-zinc-500">
        Cancel any time · {FREE_APPLICATION_QUOTA} free submitted applications ·
        you pay only for jobs actually submitted
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
