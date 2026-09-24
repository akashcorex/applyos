'use client';

import { addDateKey, heatmapLevel } from '@applyso/validation';

import type {
  ProfileActivityDay,
  ProfileActivityTotals,
} from './profile-types';

const LEVEL_CLASS = [
  'bg-neutral-800/80 dark:bg-[#161b22]',
  'bg-emerald-950 dark:bg-[#0e4429]',
  'bg-emerald-800 dark:bg-[#006d32]',
  'bg-emerald-600 dark:bg-[#26a641]',
  'bg-emerald-500 dark:bg-[#39d353]',
] as const;

interface ProfileActivityHeatmapProps {
  days: ProfileActivityDay[];
  totals: ProfileActivityTotals;
  rangeStart: string;
  rangeEnd: string;
}

interface HeatCell extends ProfileActivityDay {
  future?: boolean;
}

function monthLabel(dateKey: string): string {
  const [year, month] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

function formatDayLabel(day: ProfileActivityDay): string {
  const [year, month, date] = day.date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, date));
  const weekday = parsed.toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const rest = parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const noun = day.count === 1 ? 'contribution' : 'contributions';
  return `${day.count} ${noun} on ${weekday} ${rest}`;
}

function padWeeks(days: ProfileActivityDay[]): HeatCell[][] {
  const weeks: HeatCell[][] = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  const last = weeks[weeks.length - 1];
  const lastCell = last?.[last.length - 1];
  if (last && lastCell && last.length < 7) {
    let cursor = lastCell.date;
    while (last.length < 7) {
      cursor = addDateKey(cursor, 1);
      last.push({ date: cursor, count: 0, kinds: [], future: true });
    }
  }
  return weeks;
}

export function ProfileActivityHeatmap({
  days,
  totals,
  rangeStart,
  rangeEnd,
}: ProfileActivityHeatmapProps) {
  const weeks = padWeeks(days);
  const maxCount = days.reduce((peak, day) => Math.max(peak, day.count), 0);
  const noun = totals.events === 1 ? 'contribution' : 'contributions';
  const weekTemplate = `repeat(${Math.max(weeks.length, 1)}, minmax(0, 1fr))`;

  return (
    <section
      aria-label="Activity heatmap"
      className="w-full border-b border-border bg-background"
    >
      {/* ── Section Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Activity Heatmap
          </h2>
          <span className="hidden sm:inline text-xs text-zinc-500 font-mono">
            · {totals.events} {noun} in the last year
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <span>Less</span>
          <div className="flex items-center gap-1">
            {LEVEL_CLASS.map((className, level) => (
              <span
                key={className}
                className={`h-2.5 w-2.5 rounded-[1px] ${className} ${
                  level === 4 ? 'shadow-[0_0_6px_rgba(57,211,83,0.45)]' : ''
                }`}
                aria-label={`Activity level ${level}`}
              />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>

      {/* ── 4-Column Metric Strip (Divided by 1px vertical borders) */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
        <div className="px-6 sm:px-8 py-3.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Applications
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {totals.applications}
          </p>
        </div>
        <div className="px-6 sm:px-8 py-3.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Submitted
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {totals.submitted}
          </p>
        </div>
        <div className="px-6 sm:px-8 py-3.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Active Workflows
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {totals.activeWorkflows}
          </p>
        </div>
        <div className="px-6 sm:px-8 py-3.5">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Current Streak
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
              {totals.currentStreak}d
            </span>
            <span className="text-[11px] font-mono text-zinc-500">
              (best {totals.longestStreak}d)
            </span>
          </div>
        </div>
      </div>

      {/* ── Heatmap Grid (Flush edge-to-edge) ──────────────────── */}
      <div className="px-6 sm:px-8 py-5 overflow-x-auto">
        {totals.events === 0 ? (
          <p className="text-xs text-muted-foreground mb-3 font-mono">
            Apply, match, or upload a resume to see activity charted here.
          </p>
        ) : null}

        <div className="min-w-[720px]">
          {/* Month labels */}
          <div className="flex w-full gap-2 mb-1.5">
            <div className="w-7 shrink-0" />
            <div
              className="grid flex-1 min-w-0 text-[10px] font-mono leading-none text-muted-foreground"
              style={{ gridTemplateColumns: weekTemplate, columnGap: '3px' }}
            >
              {weeks.map((week, weekIndex) => {
                const first = week.find((cell) => !cell.future);
                const prev = weeks[weekIndex - 1]?.find((cell) => !cell.future);
                const show =
                  first &&
                  (weekIndex === 0 ||
                    monthLabel(first.date) !== monthLabel(prev?.date ?? ''));
                return (
                  <div
                    key={week[0]?.date ?? weekIndex}
                    className="overflow-visible whitespace-nowrap text-left"
                  >
                    {show && first ? monthLabel(first.date) : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Weekday labels + cells */}
          <div className="flex w-full items-stretch gap-2">
            <div
              className="grid w-7 shrink-0 text-[10px] font-mono leading-none text-muted-foreground"
              style={{
                gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
                rowGap: '3px',
              }}
            >
              <span className="flex items-center">Mon</span>
              <span />
              <span className="flex items-center">Wed</span>
              <span />
              <span className="flex items-center">Fri</span>
              <span />
              <span />
            </div>
            <div
              className="grid flex-1 min-w-0"
              role="img"
              aria-label={`${totals.events} ${noun} from ${rangeStart} to ${rangeEnd}.`}
              style={{ gridTemplateColumns: weekTemplate, columnGap: '3px' }}
            >
              {weeks.map((week) => (
                <div
                  key={week[0]?.date}
                  className="grid min-w-0"
                  style={{
                    gridTemplateRows: 'repeat(7, minmax(0, 1fr))',
                    rowGap: '3px',
                  }}
                >
                  {week.map((day) => {
                    if (day.future) {
                      return (
                        <span
                          key={day.date}
                          className="min-w-0 w-full aspect-square rounded-[1px] bg-transparent"
                          aria-hidden
                        />
                      );
                    }
                    const level = heatmapLevel(day.count, maxCount);
                    const glow =
                      level === 4 ? 'shadow-[0_0_8px_rgba(57,211,83,0.7)]' : '';
                    const label = formatDayLabel(day);
                    return (
                      <span
                        key={day.date}
                        title={label}
                        className={`min-w-0 w-full aspect-square rounded-[1px] transition-colors ${LEVEL_CLASS[level]} ${glow}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
