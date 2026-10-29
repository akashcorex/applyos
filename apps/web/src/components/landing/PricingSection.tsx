'use client';

import { useState, type ComponentType } from 'react';

import Link from 'next/link';

import { motion } from 'motion/react';

import {
  CalendarCheck,
  Check,
  FilePenLine,
  FileText,
  Flame,
  Globe,
  IoIosTrendingUp,
  Layers,
  Rocket,
  Search,
  Send,
  ShieldCheck,
  Users,
  Zap,
} from '@applyso/ui/icons';
import {
  ADD_ON_PACK_BONUS,
  FREE_APPLICATION_QUOTA,
  PLAN_APPLICATION_QUOTAS,
  PLAN_INTERVAL_SAVINGS,
  PLAN_PRICES_INR,
  monthlyEquivalentInr,
  type BillingPlan,
} from '@applyso/validation';

import { planLabel } from '@/lib/billing';
import { cn } from '@/lib/utils';

import PricingIcon from './icons/pricingicon';

type BillingCycle = 'monthly' | 'yearly';

interface PlanFeature {
  icon: ComponentType<{ className?: string }>;
  text: string;
}

interface PlanCard {
  plan: BillingPlan;
  description: string;
  cta: string;
  featured?: boolean;
  listLabel: string;
  features: PlanFeature[];
}

const PLANS: PlanCard[] = [
  {
    plan: 'starter',
    description: 'Your job search starts here.',
    cta: 'Choose Scout',
    listLabel: 'Scout includes:',
    features: [
      {
        icon: Zap,
        text: `${PLAN_APPLICATION_QUOTAS.starter} submitted applications / 30 days`,
      },
      { icon: Search, text: 'Autonomous job discovery' },
      { icon: FilePenLine, text: 'AI resume tailored per role' },
      { icon: Send, text: 'Forms filled and submitted for you' },
      { icon: Users, text: 'LinkedIn recruiter connects' },
      { icon: Layers, text: 'Application tracking dashboard' },
      { icon: ShieldCheck, text: 'Hosted checkout — card stays with Dodo' },
      { icon: Check, text: 'Cancel anytime' },
    ],
  },
  {
    plan: 'pro',
    description: 'Lock in and level up your search.',
    cta: 'Upgrade to Ace',
    featured: true,
    listLabel: 'Everything in Scout, plus:',
    features: [
      {
        icon: Zap,
        text: `${PLAN_APPLICATION_QUOTAS.pro} submitted applications / 30 days`,
      },
      { icon: FileText, text: 'Multiple resume variants' },
      { icon: Globe, text: 'LinkedIn session sync' },
      { icon: IoIosTrendingUp, text: 'Search analytics and insights' },
      { icon: Rocket, text: 'Top-up packs when you need more' },
    ],
  },
  {
    plan: 'power',
    description: 'Full send on your job hunt.',
    cta: 'Choose Conqueror',
    listLabel: 'Everything in Ace, plus:',
    features: [
      {
        icon: Zap,
        text: `${PLAN_APPLICATION_QUOTAS.power.toLocaleString('en-IN')} submitted applications / 30 days`,
      },
      { icon: Flame, text: 'Maximum apply throughput' },
      { icon: CalendarCheck, text: 'Built for placement-season volume' },
      { icon: ShieldCheck, text: 'Hosted checkout — card stays with Dodo' },
    ],
  },
];

function formatInr(amount: number): string {
  return `₹${amount.toLocaleString('en-IN')}`;
}

function perApplicationPrice(plan: BillingPlan, cycle: BillingCycle): string {
  const inr =
    cycle === 'monthly'
      ? PLAN_PRICES_INR[plan].monthly
      : monthlyEquivalentInr(plan, 'annual');
  const perApp = inr / PLAN_APPLICATION_QUOTAS[plan];
  return `₹${perApp.toLocaleString('en-IN', { maximumFractionDigits: 1 })}`;
}

function PlanPrice({
  plan,
  cycle,
}: {
  plan: BillingPlan;
  cycle: BillingCycle;
}) {
  if (cycle === 'monthly') {
    return (
      <>
        <span className="text-4xl font-semibold tracking-tight text-white">
          {formatInr(PLAN_PRICES_INR[plan].monthly)}
        </span>
        <span className="text-sm text-neutral-400"> / month</span>
        <p className="mt-2 text-xs text-neutral-500">Billed monthly</p>
        <p className="mt-1 text-xs text-neutral-500">
          ≈ {perApplicationPrice(plan, cycle)} per submitted application
        </p>
      </>
    );
  }
  return (
    <>
      <span className="text-4xl font-semibold tracking-tight text-white">
        {formatInr(monthlyEquivalentInr(plan, 'annual'))}
      </span>
      <span className="text-sm text-neutral-400"> / month</span>
      <p className="mt-2 text-xs text-neutral-500">
        {formatInr(PLAN_PRICES_INR[plan].annual)} billed annually · save{' '}
        {PLAN_INTERVAL_SAVINGS[plan].annual}%
      </p>
      <p className="mt-1 text-xs text-neutral-500">
        ≈ {perApplicationPrice(plan, cycle)} per submitted application
      </p>
    </>
  );
}

function PricingSection() {
  const [cycle, setCycle] = useState<BillingCycle>('monthly');

  return (
    <section id="pricing" className="w-full scroll-mt-24 py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ transform: 'translateY(8px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="mx-auto mb-10 max-w-7xl text-center"
        >
          <PricingIcon />
          <h2 className="mx-auto mb-2 mt-6 max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text py-2 text-center text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl">
            Pay for applications. Not the tool.
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-center text-[0.8rem] text-transparent sm:text-[0.87rem] lg:text-[1rem]">
            Every paid tier is the full product — only the volume differs. Start
            free with {FREE_APPLICATION_QUOTA} submitted applications.
          </p>
          <div className="inline-flex items-center gap-1 rounded-full border border-neutral-800 bg-neutral-900/80 p-1">
            {(['monthly', 'yearly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setCycle(option)}
                aria-pressed={cycle === option}
                className={cn(
                  'pressable rounded-full px-5 py-1.5 text-sm font-medium capitalize transition-colors',
                  cycle === option
                    ? 'bg-neutral-700/80 text-white shadow'
                    : 'text-neutral-400 hover:text-white',
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ transform: 'translateY(8px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3"
        >
          {PLANS.map(
            ({ plan, description, cta, featured, listLabel, features }) => (
              <div
                key={plan}
                className={cn(
                  'relative rounded-2xl border p-2',
                  featured
                    ? 'border-neutral-600 bg-neutral-900/60'
                    : 'border-neutral-800/60 bg-neutral-950/40',
                )}
              >
                {featured ? (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-100 px-3 py-0.5 text-[11px] font-semibold text-black">
                    Recommended
                  </span>
                ) : null}
                <div className="rounded-xl border border-neutral-800/70 bg-black/40 p-6">
                  <h3 className="text-lg font-semibold text-white">
                    {planLabel(plan)}
                  </h3>
                  <p className="mt-1 min-h-10 text-sm leading-relaxed text-neutral-400">
                    {description}
                  </p>
                  <div className="mt-4">
                    <PlanPrice plan={plan} cycle={cycle} />
                  </div>
                  <Link
                    href="/signup"
                    className={cn(
                      'pressable mt-6 flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold',
                      featured
                        ? 'bg-neutral-200 text-black shadow-[inset_0px_1.2px_0px_#ffffff] hover:bg-neutral-300'
                        : 'border border-neutral-700 text-white hover:bg-white/5',
                    )}
                  >
                    {cta}
                  </Link>
                </div>
                <div className="px-4 pb-6 pt-5">
                  <p className="mb-4 text-xs font-medium uppercase tracking-wider text-neutral-500">
                    {listLabel}
                  </p>
                  <ul className="space-y-3.5">
                    {features.map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-2.5">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-neutral-300" />
                        <span className="text-sm text-neutral-300">{text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ),
          )}
        </motion.div>

        <div className="mx-auto mt-6 max-w-6xl rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-6 text-center">
          <p className="text-sm font-medium text-neutral-200">
            What counts as a submitted application?
          </p>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-neutral-400">
            Only one that actually goes out. Failed, paused, cancelled or stuck
            applications never count. Need more volume? Top-up packs (+
            {ADD_ON_PACK_BONUS.plus_50} or +{ADD_ON_PACK_BONUS.plus_150}{' '}
            applications) are available in Settings → Billing and apply to your
            current cycle.
          </p>
        </div>

        <p className="mt-10 text-center text-xs text-neutral-500">
          Cancel anytime. You pay only for applications actually submitted.
        </p>
      </div>
    </section>
  );
}

export default PricingSection;
