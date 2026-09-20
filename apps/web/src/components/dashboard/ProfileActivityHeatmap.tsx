import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { addDateKey, heatmapLevel } from '@applyso/validation';

import type {
  ProfileActivityDay,
  ProfileActivityTotals,
} from './profile-types';

const LEVEL_CLASS = [
  'bg-[#ebedf0] dark:bg-[#161b22]',
  'bg-[#9be9a8] dark:bg-[#0e4429]',
  'bg-[#40c463] dark:bg-[#006d32]',
  'bg-[#30a14e] dark:bg-[#26a641]',
  'bg-[#216e39] dark:bg-[#39d353]',
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>
          {totals.events} {noun} in the last year
        </CardTitle>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {LEVEL_CLASS.map((className, level) => (
            <span
              key={className}
              className={`h-[11px] w-[11px] rounded-[2px] ${className} ${
                level === 4 ? 'shadow-[0_0_6px_rgba(57,211,83,0.45)]' : ''
              }`}
              aria-label={`Activity level ${level}`}
            />
          ))}
          <span>More</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 w-full gap-3 text-xs">
          <div className="rounded-[8px] border border-slate-200/80 dark:border-border px-3 py-2">
            <p className="text-muted-foreground">Applications</p>
            <p className="text-lg font-semibold">{totals.applications}</p>
          </div>
          <div className="rounded-[8px] border border-slate-200/80 dark:border-border px-3 py-2">
            <p className="text-muted-foreground">Submitted</p>
            <p className="text-lg font-semibold">{totals.submitted}</p>
          </div>
          <div className="rounded-[8px] border border-slate-200/80 dark:border-border px-3 py-2">
            <p className="text-muted-foreground">Active workflows</p>
            <p className="text-lg font-semibold">{totals.activeWorkflows}</p>
          </div>
          <div className="rounded-[8px] border border-slate-200/80 dark:border-border px-3 py-2">
            <p className="text-muted-foreground">Current streak</p>
            <p className="text-lg font-semibold">
              {totals.currentStreak}d
              <span className="ml-1 text-[11px] font-mono text-slate-500">
                best {totals.longestStreak}d
              </span>
            </p>
          </div>
        </div>

        {totals.events === 0 ? (
          <p className="text-xs text-muted-foreground">
            Apply, match, or upload a resume to see activity here.
          </p>
        ) : null}

        <div className="w-full min-w-0">
          <div className="w-full min-w-0">
            <div className="flex w-full gap-2 mb-1">
              <div className="w-7 shrink-0" />
              <div
                className="grid flex-1 min-w-0 text-[10px] leading-none text-muted-foreground"
                style={{ gridTemplateColumns: weekTemplate, columnGap: '3px' }}
              >
                {weeks.map((week, weekIndex) => {
                  const first = week.find((cell) => !cell.future);
                  const prev = weeks[weekIndex - 1]?.find(
                    (cell) => !cell.future,
                  );
                  const show =
                    first &&
                    (weekIndex === 0 ||
                      monthLabel(first.date) !== monthLabel(prev?.date ?? ''));
                  return (
                    <div
                      key={week[0]?.date ?? weekIndex}
                      className="min-w-0 overflow-hidden whitespace-nowrap"
                    >
                      {show && first ? monthLabel(first.date) : ''}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex w-full items-stretch gap-2">
              <div
                className="grid w-7 shrink-0 text-[10px] leading-none text-muted-foreground"
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
                            className="min-w-0 w-full aspect-square rounded-[2px] bg-transparent"
                            aria-hidden
                          />
                        );
                      }
                      const level = heatmapLevel(day.count, maxCount);
                      const glow =
                        level === 4
                          ? 'shadow-[0_0_8px_rgba(57,211,83,0.7)]'
                          : '';
                      const label = formatDayLabel(day);
                      // Presentational cell — the grid parent carries
                      // role="img" + aria-label. A focusable button here
                      // would be keyboard noise (365 tab stops).
                      return (
                        <span
                          key={day.date}
                          title={label}
                          className={`min-w-0 w-full aspect-square rounded-[2px] ${LEVEL_CLASS[level]} ${glow}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
