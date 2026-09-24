'use client';

import {
  Briefcase,
  CheckCircle2,
  Send,
  Zap,
} from '@applyso/ui/icons';
import type { ProfileCompletion } from '@applyso/validation';

import type { ProfileActivityTotals } from './profile-types';

interface ProfileMetricStripProps {
  completion?: ProfileCompletion | null;
  experienceYears?: string | null;
  seniority?: string | null;
  totals?: ProfileActivityTotals | null;
  onCompleteProfile?: () => void;
}

function MicroBarSparkline({
  bars = [40, 55, 35, 60, 75, 50, 85, 70, 95, 90],
  color = 'blue',
}: {
  bars?: number[];
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: 'bg-[#3b82f6]/85 hover:bg-[#3b82f6]',
    orange: 'bg-[#f97316]/85 hover:bg-[#f97316]',
    green: 'bg-[#10b981]/85 hover:bg-[#10b981]',
    red: 'bg-[#ef4444]/85 hover:bg-[#ef4444]',
    purple: 'bg-[#a855f7]/85 hover:bg-[#a855f7]',
  };
  const barClass = colorMap[color] ?? 'bg-[#3b82f6]/85';

  return (
    <div className="flex items-end gap-1 h-8 px-1">
      {bars.map((height, i) => (
        <div
          key={i}
          className={`w-1 rounded-[1px] transition-colors duration-200 ${barClass}`}
          style={{ height: `${Math.max(12, Math.min(100, height))}%` }}
        />
      ))}
    </div>
  );
}

export function ProfileMetricStrip({
  completion,
  experienceYears,
  seniority,
  totals,
  onCompleteProfile,
}: ProfileMetricStripProps) {
  const percent = completion?.percent ?? 0;
  const filled = completion?.filled ?? 0;
  const total = completion?.total ?? 6;
  const apps = totals?.applications ?? 0;
  const interviews = totals?.interviews ?? 0;
  const streak = totals?.currentStreak ?? 0;

  const completenessBars = [
    25,
    35,
    45,
    Math.min(100, percent * 0.6),
    Math.min(100, percent * 0.75),
    Math.min(100, percent * 0.85),
    Math.min(100, percent * 0.9),
    percent,
    percent,
    percent,
  ];

  const expLabel = experienceYears?.trim()
    ? `${experienceYears.trim()} Yrs`
    : 'Not set';

  const expSeniority = seniority?.trim()
    ? seniority.charAt(0).toUpperCase() + seniority.slice(1)
    : 'Candidate';

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
      {/* 1. Completeness */}
      <div
        onClick={onCompleteProfile}
        className="flex items-start justify-between p-5 bg-background hover:bg-neutral-900/20 transition-colors group cursor-pointer"
      >
        <div className="flex flex-col justify-between h-full min-w-0 pr-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-blue-500 shrink-0" />
            <span className="truncate text-primary">Profile Completeness</span>
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-tight text-foreground font-sans">
            {percent}%
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="font-medium tabular-nums text-blue-400">
              {filled} of {total}
            </span>
            <span className="truncate text-[11px] text-muted-foreground ml-0.5">
              sections complete
            </span>
          </div>
        </div>
        <MicroBarSparkline bars={completenessBars} color="blue" />
      </div>

      {/* 2. Experience & Seniority */}
      <div className="flex items-start justify-between p-5 bg-background hover:bg-neutral-900/20 transition-colors group">
        <div className="flex flex-col justify-between h-full min-w-0 pr-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Briefcase className="size-4 text-orange-500 shrink-0" />
            <span className="truncate text-primary">Experience Level</span>
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-tight text-foreground font-sans">
            {expLabel}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="font-medium tabular-nums text-orange-400">
              {expSeniority}
            </span>
            <span className="truncate text-[11px] text-muted-foreground ml-0.5">
              tier match
            </span>
          </div>
        </div>
        <MicroBarSparkline
          bars={[35, 45, 60, 50, 75, 65, 80, 70, 95, 88]}
          color="orange"
        />
      </div>

      {/* 3. Applications */}
      <div className="flex items-start justify-between p-5 bg-background hover:bg-neutral-900/20 transition-colors group">
        <div className="flex flex-col justify-between h-full min-w-0 pr-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Send className="size-4 text-emerald-500 shrink-0" />
            <span className="truncate text-primary">Active Submissions</span>
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-tight text-foreground font-sans">
            {apps}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="font-medium tabular-nums text-emerald-400">
              {interviews}
            </span>
            <span className="truncate text-[11px] text-muted-foreground ml-0.5">
              interviews scheduled
            </span>
          </div>
        </div>
        <MicroBarSparkline
          bars={[20, 30, 45, 40, 55, 65, 75, 70, 85, 90]}
          color="green"
        />
      </div>

      {/* 4. Momentum / Streak */}
      <div className="flex items-start justify-between p-5 bg-background hover:bg-neutral-900/20 transition-colors group">
        <div className="flex flex-col justify-between h-full min-w-0 pr-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Zap className="size-4 text-purple-500 shrink-0" />
            <span className="truncate text-primary">Candidate Streak</span>
          </div>
          <div className="mt-2 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-tight text-foreground font-sans">
            {streak} {streak === 1 ? 'Day' : 'Days'}
          </div>
          <div className="mt-1 flex items-center gap-1 text-xs">
            <span className="font-medium tabular-nums text-purple-400">
              Active
            </span>
            <span className="truncate text-[11px] text-muted-foreground ml-0.5">
              momentum streak
            </span>
          </div>
        </div>
        <MicroBarSparkline
          bars={[40, 50, 45, 60, 70, 85, 95, 80, 75, 90]}
          color="purple"
        />
      </div>
    </div>
  );
}
