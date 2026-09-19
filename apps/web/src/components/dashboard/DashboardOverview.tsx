'use client';

import {
  ArrowUpRight,
  CheckCircle2,
  Eye,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

import { Area } from '@/components/dither-kit/area';
import { AreaChart } from '@/components/dither-kit/area-chart';
import { Legend } from '@/components/dither-kit/legend';
import type { DitherColor } from '@/components/dither-kit/palette';
import { Tooltip } from '@/components/dither-kit/tooltip';
import { XAxis } from '@/components/dither-kit/x-axis';
import { YAxis } from '@/components/dither-kit/y-axis';

const ACCENT = {
  blue: 'bg-blue-50 dark:bg-[#0e0f12] text-blue-600 dark:text-blue-400 border-blue-100 dark:border-[#22242a]',
  purple:
    'bg-purple-50 dark:bg-[#0e0f12] text-purple-600 dark:text-purple-400 border-purple-100 dark:border-[#22242a]',
  amber:
    'bg-amber-50 dark:bg-[#0e0f12] text-amber-600 dark:text-amber-400 border-amber-100 dark:border-[#22242a]',
  emerald:
    'bg-emerald-50 dark:bg-[#0e0f12] text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-[#22242a]',
} as const;

export type OverviewStat = {
  label: string;
  value: string;
  delta?: string;
  icon: LucideIcon;
  accent: keyof typeof ACCENT;
};

export type OverviewChartPoint = Record<string, string | number> & {
  day: string;
};

export type OverviewChartConfig = Record<
  string,
  { label: string; color: DitherColor }
>;

const DEFAULT_STATS: OverviewStat[] = [
  {
    label: 'Applications',
    value: '48',
    delta: '+127.1%',
    icon: Zap,
    accent: 'blue',
  },
  {
    label: 'Discovered',
    value: '142',
    delta: '+34.2%',
    icon: Eye,
    accent: 'purple',
  },
  {
    label: 'Outreach Rate',
    value: '43.6%',
    delta: '+31.0%',
    icon: TrendingUp,
    accent: 'amber',
  },
  {
    label: 'Tailor Score',
    value: '96.4',
    delta: '+14.5%',
    icon: CheckCircle2,
    accent: 'emerald',
  },
];

const DEFAULT_CHART: OverviewChartPoint[] = [
  { day: 'Dec 9', applications: 18, outreach: 8 },
  { day: 'Dec 10', applications: 24, outreach: 14 },
  { day: 'Dec 11', applications: 16, outreach: 11 },
  { day: 'Dec 12', applications: 28, outreach: 19 },
  { day: 'Dec 13', applications: 38, outreach: 26 },
  { day: 'Dec 14', applications: 42, outreach: 31 },
  { day: 'Dec 15', applications: 29, outreach: 20 },
  { day: 'Dec 16', applications: 35, outreach: 27 },
];

const DEFAULT_CHART_CONFIG: OverviewChartConfig = {
  applications: { label: 'Job Applications', color: 'blue' },
  outreach: { label: 'Recruiter Outreach', color: 'purple' },
};

export function DashboardOverview({
  stats = DEFAULT_STATS,
  chartTitle = 'Application & Outreach Velocity',
  chartDescription = 'Real-time dithered metrics for automated applications and recruiter outreach.',
  chartBadge = 'LIVE STREAM',
  chartData = DEFAULT_CHART,
  chartConfig = DEFAULT_CHART_CONFIG,
}: {
  stats?: OverviewStat[];
  chartTitle?: string;
  chartDescription?: string;
  chartBadge?: string;
  chartData?: OverviewChartPoint[];
  chartConfig?: OverviewChartConfig;
}) {
  const chartKeys = Object.keys(chartConfig);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.label}
              className="shadow-sm transition-all duration-150"
            >
              <CardHeader className="flex flex-row items-center justify-between pb-1 p-4">
                <CardTitle className="text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider font-mono">
                  {stat.label}
                </CardTitle>
                <div
                  className={`h-6 w-6 rounded-[6px] flex items-center justify-center border ${ACCENT[stat.accent]}`}
                >
                  <Icon className="h-3 w-3" />
                </div>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
                  {stat.value}
                </div>
                {stat.delta ? (
                  <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-mono font-medium">
                    <ArrowUpRight className="h-3 w-3" />
                    <span>{stat.delta}</span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="shadow-sm p-5 text-slate-900 dark:text-[#f1f3f9]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
              {chartTitle}
            </h3>
            <p className="text-xs text-slate-500 dark:text-[#8a8f9d] font-normal">
              {chartDescription}
            </p>
          </div>
          <Badge
            variant="outline"
            className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-mono rounded-[4px] px-2 py-0.5"
          >
            {chartBadge}
          </Badge>
        </div>

        <div className="w-full h-72">
          <AreaChart
            data={chartData}
            config={chartConfig}
            bloom="aura"
            className="h-full w-full"
          >
            <XAxis dataKey="day" />
            <YAxis />
            <Legend isClickable />
            <Tooltip labelKey="day" />
            {chartKeys[0] ? (
              <Area dataKey={chartKeys[0]} variant="gradient" />
            ) : null}
            {chartKeys[1] ? (
              <Area dataKey={chartKeys[1]} variant="dotted" />
            ) : null}
          </AreaChart>
        </div>
      </Card>
    </div>
  );
}
