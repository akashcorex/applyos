'use client';

import { useState } from 'react';

import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Card } from '@applyso/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@applyso/ui/tabs';

import { Area } from '@/components/dither-kit/area';
import { AreaChart } from '@/components/dither-kit/area-chart';
import { Legend } from '@/components/dither-kit/legend';
import type { DitherColor } from '@/components/dither-kit/palette';
import { Tooltip } from '@/components/dither-kit/tooltip';
import { XAxis } from '@/components/dither-kit/x-axis';
import { YAxis } from '@/components/dither-kit/y-axis';
import {
  RecentActivityCard,
  type RecentActivityItem,
} from '@/components/dashboard/RecentActivityCard';
import { DashboardDataTable } from '@/components/dashboard/DashboardDataTable';

export type OverviewStat = {
  label: string;
  value: string;
  delta?: string;
  isNegative?: boolean;
  trendingText?: string;
  subtext?: string;
  accent?: string;
  icon?: LucideIcon;
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
    label: 'Total Applications',
    value: '1,250',
    delta: '+12.5%',
    trendingText: 'Trending up this month ↗',
    subtext: 'Applications submitted last 6 months',
    icon: Zap,
  },
  {
    label: 'New Jobs Discovered',
    value: '1,234',
    delta: '-20%',
    isNegative: true,
    trendingText: 'Down 20% this period ↘',
    subtext: 'Acquisition needs attention',
    icon: Eye,
  },
  {
    label: 'Active Accounts / Matches',
    value: '45,678',
    delta: '+12.5%',
    trendingText: 'Strong user retention ↗',
    subtext: 'Engagement exceed targets',
    icon: TrendingUp,
  },
  {
    label: 'Growth & Tailor Rate',
    value: '96.5%',
    delta: '+4.5%',
    trendingText: 'Steady performance increase ↗',
    subtext: 'Meets growth projections',
    icon: CheckCircle2,
  },
];

const DEFAULT_CHART: OverviewChartPoint[] = [
  { day: 'Apr 5', applications: 18, outreach: 8 },
  { day: 'Apr 12', applications: 24, outreach: 14 },
  { day: 'Apr 19', applications: 16, outreach: 11 },
  { day: 'Apr 26', applications: 28, outreach: 19 },
  { day: 'May 3', applications: 38, outreach: 26 },
  { day: 'May 10', applications: 42, outreach: 31 },
  { day: 'May 17', applications: 29, outreach: 20 },
  { day: 'May 24', applications: 35, outreach: 27 },
  { day: 'May 31', applications: 48, outreach: 34 },
  { day: 'Jun 7', applications: 40, outreach: 30 },
  { day: 'Jun 14', applications: 52, outreach: 38 },
  { day: 'Jun 21', applications: 45, outreach: 32 },
  { day: 'Jun 30', applications: 58, outreach: 44 },
];

const DEFAULT_CHART_CONFIG: OverviewChartConfig = {
  applications: { label: 'Job Applications', color: 'grey' },
  outreach: { label: 'Recruiter Outreach', color: 'grey' },
};

export function DashboardOverview({
  stats = DEFAULT_STATS,
  chartTitle = 'Total Visitors & Velocity',
  chartDescription = 'Total for the last 3 months',
  chartBadge = 'LIVE STREAM',
  chartData = DEFAULT_CHART,
  chartConfig = DEFAULT_CHART_CONFIG,
  showRecent = true,
  recentTitle = 'Recent Applications',
  recentItems,
}: {
  stats?: OverviewStat[];
  chartTitle?: string;
  chartDescription?: string;
  chartBadge?: string;
  chartData?: OverviewChartPoint[];
  chartConfig?: OverviewChartConfig;
  showRecent?: boolean;
  recentTitle?: string;
  recentItems?: RecentActivityItem[];
}) {
  const chartKeys = Object.keys(chartConfig);
  const [timeRange, setTimeRange] = useState<'3m' | '30d' | '7d'>('3m');

  return (
    <Tabs defaultValue="overview" className="space-y-6">
      {/* Navigation Header Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-foreground">
            Dashboard Overview
          </h2>
          <p className="text-xs text-muted-foreground">
            Monitor automated job discovery, application metrics, and recruiter response rates.
          </p>
        </div>
        <TabsList className="bg-slate-100 dark:bg-card p-1 border border-border rounded-[8px] h-9">
          <TabsTrigger
            value="overview"
            className="text-xs px-3.5 py-1 text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground rounded-[6px] font-medium"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="analytics"
            className="text-xs px-3.5 py-1 text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground rounded-[6px] font-medium"
          >
            Analytics
          </TabsTrigger>
          <TabsTrigger
            value="applications"
            className="text-xs px-3.5 py-1 text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground rounded-[6px] font-medium"
          >
            Applications
          </TabsTrigger>
          <TabsTrigger
            value="activity"
            className="text-xs px-3.5 py-1 text-muted-foreground data-[state=active]:bg-card data-[state=active]:text-foreground rounded-[6px] font-medium"
          >
            Activity
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="overview" className="space-y-6 mt-0">
        {/* Top 4 Stat Cards in exact Dashboard-01 Ash theme */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            return (
              <Card
                key={stat.label}
                className="p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      {stat.label}
                    </span>
                    {stat.delta ? (
                      <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-mono font-medium bg-secondary text-secondary-foreground border border-border">
                        {stat.isNegative ? (
                          <ArrowDownRight className="h-3 w-3 text-rose-400" />
                        ) : (
                          <ArrowUpRight className="h-3 w-3 text-emerald-400" />
                        )}
                        <span>{stat.delta}</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="text-3xl font-bold text-foreground tracking-tight mt-2">
                    {stat.value}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 space-y-0.5">
                  <p className="text-xs font-medium text-foreground flex items-center gap-1">
                    {stat.trendingText ?? 'Trending up this month ↗'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {stat.subtext ?? 'Visitors for the last 6 months'}
                  </p>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Main Visitors Chart Area & Activity Feed */}
        <div
          className={`grid gap-6 ${
            showRecent ? 'grid-cols-1 lg:grid-cols-7' : 'grid-cols-1'
          }`}
        >
          <Card
            className={`shadow-sm p-6 ${
              showRecent ? 'lg:col-span-4' : 'w-full'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-5 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-foreground tracking-tight">
                    {chartTitle}
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-mono rounded-[4px] px-2 py-0.5"
                  >
                    {chartBadge}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  {chartDescription}
                </p>
              </div>

              {/* Time Range Selector (Matching Dashboard-01 Screenshot) */}
              <div className="inline-flex items-center rounded-lg border border-border bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setTimeRange('3m')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timeRange === '3m'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Last 3 months
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('30d')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timeRange === '30d'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Last 30 days
                </button>
                <button
                  type="button"
                  onClick={() => setTimeRange('7d')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timeRange === '7d'
                      ? 'bg-card text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Last 7 days
                </button>
              </div>
            </div>

            <div className="w-full h-80 pt-2">
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

          {showRecent ? (
            <div className="lg:col-span-3">
              <RecentActivityCard
                title={recentTitle}
                items={recentItems}
              />
            </div>
          ) : null}
        </div>

        {/* Data Table Section (Shadcn Data Table / TanStack Grid) */}
        <DashboardDataTable />
      </TabsContent>

      <TabsContent value="analytics" className="mt-0">
        <Card className="shadow-sm p-6">
          <h3 className="text-sm font-semibold mb-2">Analytics & Conversion Rates</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Deep dive into resume match scores, submission pass rates, and recruiter response speed.
          </p>
          <div className="w-full h-64 border border-dashed border-border rounded-[8px] flex items-center justify-center text-xs text-muted-foreground">
            Analytics breakdown module loaded
          </div>
        </Card>
      </TabsContent>

      <TabsContent value="applications" className="mt-0">
        <DashboardDataTable />
      </TabsContent>

      <TabsContent value="activity" className="mt-0">
        <Card className="shadow-sm p-6">
          <h3 className="text-sm font-semibold mb-2">Live Agent Activity Log</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Real-time execution log of job crawlers, resume tailors, and auto-submit agents.
          </p>
          <div className="w-full h-64 border border-dashed border-border rounded-[8px] flex items-center justify-center text-xs text-muted-foreground font-mono">
            Agent event stream active
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
