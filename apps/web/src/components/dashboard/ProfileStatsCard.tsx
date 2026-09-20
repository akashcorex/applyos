'use client';

import type { ProfileActivityTotals } from './profile-types';

/**
 * Compact career-activity stats. Only metrics that are meaningful today —
 * no dashboard of zeros.
 */
export function ProfileStatsCard({
  totals,
}: {
  totals: ProfileActivityTotals;
}) {
  const stats = [
    { label: 'Applications', value: totals.applications },
    { label: 'Interviews', value: totals.interviews ?? 0 },
    { label: 'Jobs discovered', value: totals.jobsDiscovered ?? 0 },
    {
      label: 'Day streak',
      value: totals.currentStreak,
    },
  ];

  return (
    <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
      <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8a8f9d]">
        ApplyOS stats
      </p>
      <div className="mt-3 grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label}>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">
              {stat.value.toLocaleString('en-US')}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
