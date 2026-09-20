'use client';

import { useState } from 'react';

import {
  CheckCircle2,
  Eye,
  TrendingDown,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@applyso/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@applyso/ui/tabs';

import { Area } from '@/components/dither-kit/area';
import { AreaChart } from '@/components/dither-kit/area-chart';
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
        <TabsList className="bg-muted p-1 border border-border rounded-[8px] h-9">
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
        {/* Top 4 Stat Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const TrendIcon = stat.isNegative ? TrendingDown : TrendingUp;
            return (
              <Card
                key={stat.label}
                className="bg-gradient-to-t from-primary/5 to-card shadow-xs"
              >
                <CardHeader className="relative">
                  <CardDescription>{stat.label}</CardDescription>
                  <CardTitle className="text-2xl font-semibold tabular-nums">
                    {stat.value}
                  </CardTitle>
                  {stat.delta ? (
                    <div className="absolute right-5 top-5">
                      <Badge variant="outline">
                        <TrendIcon className="size-3" />
                        {stat.delta}
                      </Badge>
                    </div>
                  ) : null}
                </CardHeader>
                <CardFooter className="flex-col items-start gap-1.5 text-sm">
                  <div className="line-clamp-1 flex gap-2 font-medium">
                    {stat.trendingText ?? 'Trending up this month'}{' '}
                    <TrendIcon className="size-4" />
                  </div>
                  <div className="text-muted-foreground">
                    {stat.subtext ?? 'Visitors for the last 6 months'}
                  </div>
                </CardFooter>
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
                  <h3 className="text-base font-semibold text-foreground tracking-tight">
                    {chartTitle}
                  </h3>
                  <Badge variant="outline">{chartBadge}</Badge>
                </div>
                <p className="text-xs text-muted-foreground font-normal mt-0.5">
                  {chartDescription}
                </p>
              </div>

              {/* Time Range Selector */}
              <div className="inline-flex items-center rounded-lg border border-border p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTimeRange('3m')}
                  className={`px-3 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    timeRange === '3m'
                      ? 'bg-muted text-foreground'
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
                      ? 'bg-muted text-foreground'
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
                      ? 'bg-muted text-foreground'
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
                bloom="off"
                className="h-full w-full"
              >
                <XAxis dataKey="day" />
                <YAxis />
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
