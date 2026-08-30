'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardDescription,
} from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';
import { Badge } from '@applyso/ui/badge';
import { Check } from 'lucide-react';
import { analytics } from '@applyso/analytics';

export default function BillingPlansPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    'monthly',
  );

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      price: '$0',
      period: 'forever',
      description: 'Essential toolkit for casual job seekers.',
      features: [
        '5 auto-applications / day',
        'Basic ATS keyword match',
        'Standard execution queue',
        'Community email support',
      ],
      current: false,
      cta: 'Current Plan',
    },
    {
      id: 'pro',
      name: 'Pro Autonomous',
      price: billingCycle === 'monthly' ? '$29' : '$24',
      period: 'per month',
      description:
        'Maximum job matching velocity & automated recruiter outreach.',
      features: [
        'Unlimited auto-applications',
        'Real-time ATS resume tailoring',
        'Automated LinkedIn outreach & messaging',
        'Parallel queue execution & fast-track',
        'Dedicated agent safety jitter & anti-detection',
        '24/7 priority support',
      ],
      current: true,
      popular: true,
      cta: 'Active Plan',
    },
  ];

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-slate-900 dark:text-[#f1f3f9]">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
            Plans & Billing
          </h1>
          <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5">
            Manage your subscription tier, usage quotas, and billing
            preferences.
          </p>
        </div>

        {/* Monthly / Yearly Toggle */}
        <div className="flex items-center self-start sm:self-auto p-1 rounded-[8px] bg-slate-100 dark:bg-[#141518] border border-slate-200 dark:border-[#22242a]">
          <button
            type="button"
            onClick={() => setBillingCycle('monthly')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors ${
              billingCycle === 'monthly'
                ? 'bg-white dark:bg-[#22242a] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9]'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle('yearly')}
            className={`px-3 py-1 text-xs font-medium rounded-[6px] transition-colors flex items-center gap-1.5 ${
              billingCycle === 'yearly'
                ? 'bg-white dark:bg-[#22242a] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9]'
            }`}
          >
            <span>Annual</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono font-semibold">
              SAVE 20%
            </span>
          </button>
        </div>
      </div>

      {/* Usage Overview Banner */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              Applications This Cycle
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f3f9]">
                142
              </span>
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                / Unlimited
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              No submission limits enforced
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              Tailored Resume Variants
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f3f9]">
                38
              </span>
              <span className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                generated
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              High ATS score optimization
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-[12px]">
          <CardContent className="p-4 space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
              LinkedIn Outreach Connects
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-slate-900 dark:text-[#f1f3f9]">
                56
              </span>
              <span className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                recruiter messages
              </span>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
              Safety jitter actively applied
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((plan) => (
          <Card
            key={plan.id}
            className={`rounded-[12px] transition-all ${
              plan.current
                ? 'border-indigo-500/60 bg-indigo-50/20 dark:bg-[#181a22] shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-500/30'
                : 'border-slate-200 dark:border-[#282a32] bg-white dark:bg-[#16171b]'
            }`}
          >
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-base font-semibold text-slate-900 dark:text-[#f1f3f9]">
                    {plan.name}
                  </span>
                  {plan.popular ? (
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20"
                    >
                      CURRENT
                    </Badge>
                  ) : null}
                </div>
                {plan.current ? (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 status-glow-emerald" />
                ) : null}
              </div>
              <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                {plan.description}
              </CardDescription>

              <div className="pt-3 flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
                  {plan.price}
                </span>
                <span className="text-xs text-slate-500 dark:text-[#8a8f9d]">
                  {plan.period}
                </span>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <div className="space-y-2 border-t border-slate-200 dark:border-[#22242a] pt-4">
                <span className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono block">
                  Included Features
                </span>
                <ul className="space-y-2 text-xs text-slate-700 dark:text-[#d1d5db]">
                  {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2">
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                disabled={plan.current}
                onClick={() => {
                  if (!plan.current) {
                    analytics.track(
                      'plan_upgrade_clicked',
                      { target_plan: plan.id, billing_cycle: billingCycle },
                      { feature: 'settings_billing' },
                    );
                  }
                }}
                className={`w-full rounded-[6px] text-xs font-semibold ${
                  plan.current
                    ? 'bg-slate-100 dark:bg-[#22242a] text-slate-500 dark:text-[#8a8f9d] border border-slate-200 dark:border-[#2e313a] cursor-default'
                    : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-200'
                }`}
              >
                {plan.cta}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
