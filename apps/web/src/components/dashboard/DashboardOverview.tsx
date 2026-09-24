'use client';

import { useId, useMemo, useState } from 'react';

import * as d3Shape from 'd3-shape';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  Clock,
  Layers,
  type LucideIcon,
} from 'lucide-react';

import { DashboardDataTable } from '@/components/dashboard/DashboardDataTable';
import {
  RecentActivityCard,
  type RecentActivityItem,
} from '@/components/dashboard/RecentActivityCard';

export type OverviewStat = {
  label: string;
  value: string;
  delta?: string;
  isNegative?: boolean;
  trendingText?: string;
  subtext?: string;
  accent?: string;
  icon?: LucideIcon;
  sparkline?: number[];
  color?: 'blue' | 'orange' | 'green' | 'red' | string;
};

export type OverviewChartPoint = Record<string, string | number> & {
  day: string;
};

export type OverviewChartConfig = Record<
  string,
  { label: string; color: string }
>;

const FORGE_DEFAULT_STATS: OverviewStat[] = [
  {
    label: 'API Requests',
    value: '682,946',
    delta: '+1240',
    subtext: 'vs last month',
    icon: ArrowLeftRight,
    sparkline: [35, 45, 60, 50, 75, 65, 80, 70, 95, 88],
    color: 'blue',
  },
  {
    label: 'Active Servers',
    value: '382,048',
    delta: '+837',
    subtext: 'vs last month',
    icon: Clock,
    sparkline: [40, 50, 45, 60, 70, 85, 95, 80, 75, 90],
    color: 'orange',
  },
  {
    label: 'Deployments Today',
    value: '12',
    delta: '+4',
    subtext: 'vs last month',
    icon: Layers,
    sparkline: [15, 20, 25, 35, 45, 60, 80, 70, 90, 100],
    color: 'green',
  },
  {
    label: 'Error Rate',
    value: '0.12%',
    delta: '-0.08%',
    isNegative: true,
    subtext: 'vs last month',
    icon: AlertTriangle,
    sparkline: [60, 55, 45, 40, 35, 30, 25, 20, 15, 12],
    color: 'red',
  },
];

// Micro-bar sparkline component
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
    <div className="flex items-end gap-[3px] h-9 shrink-0 self-end mb-0.5">
      {bars.map((h, i) => (
        <div
          key={i}
          style={{ height: `${Math.max(12, Math.min(100, h))}%` }}
          className={`w-[3.5px] rounded-[1px] transition-all duration-150 ${barClass}`}
        />
      ))}
    </div>
  );
}

// Crisp System Metrics SVG Area Chart
function SystemMetricsChart({
  title = 'System Metrics',
  timeRange,
  onTimeRangeChange,
}: {
  title?: string;
  timeRange: '3M' | '6M' | '1Y';
  onTimeRangeChange: (r: '3M' | '6M' | '1Y') => void;
}) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  // Timeframe-adjusted multiplier
  const multiplier = timeRange === '3M' ? 1 : timeRange === '6M' ? 1.35 : 2.1;

  // Key coordinate milestones matching ForgeUI reference:
  // Starts at x=38 right after Y labels, ends at x=1000 flush with right border
  // Baseline Y=210, Top Y=18
  const points = useMemo(() => {
    return [
      { x: 38, date: 'Jul 1', api: 1980, servers: 850, deploys: 80, error: 0.12 },
      { x: 110, date: 'Jul 7', api: 1880, servers: 600, deploys: 360, error: 0.12 },
      { x: 200, date: 'Jul 14', api: 1950, servers: 850, deploys: 160, error: 0.12 },
      { x: 310, date: 'Jul 21', api: 2320, servers: 840, deploys: 150, error: 0.11 },
      { x: 370, date: 'Jul 27', api: 2380, servers: 840, deploys: 150, error: 0.11 },
      { x: 440, date: 'Aug 2', api: 1900, servers: 1050, deploys: 150, error: 0.12 },
      { x: 510, date: 'Aug 6', api: 1960, servers: 1420, deploys: 200, error: 0.12 },
      { x: 580, date: 'Aug 12', api: 2000, servers: 1780, deploys: 360, error: 0.13 },
      { x: 660, date: 'Aug 17', api: 1820, servers: 940, deploys: 200, error: 0.12 },
      { x: 740, date: 'Aug 22', api: 2150, servers: 920, deploys: 160, error: 0.11 },
      { x: 820, date: 'Aug 26', api: 2020, servers: 890, deploys: 150, error: 0.12 },
      { x: 900, date: 'Aug 29', api: 2060, servers: 920, deploys: 70, error: 0.12 },
      { x: 1000, date: 'Aug 31', api: 1960, servers: 1350, deploys: 160, error: 0.12 },
    ];
  }, []);

  // Convert data value (0..2400) to SVG Y coordinate (210..18)
  const valToY = (v: number) => {
    const clamped = Math.max(0, Math.min(2400, v));
    return 210 - (clamped / 2400) * 192;
  };

  // Convert error to Y near baseline
  const errToY = (e: number) => {
    return 210 - Math.max(2, Math.min(25, e * 100));
  };

  const apiPoints = points.map((p) => ({ x: p.x, y: valToY(p.api) }));
  const serverPoints = points.map((p) => ({ x: p.x, y: valToY(p.servers) }));
  const deployPoints = points.map((p) => ({ x: p.x, y: valToY(p.deploys) }));
  const errorPoints = points.map((p) => ({ x: p.x, y: errToY(p.error) }));

  const lineGen = d3Shape
    .line<{ x: number; y: number }>()
    .x((d) => d.x)
    .y((d) => d.y)
    .curve(d3Shape.curveMonotoneX);

  const areaGen = d3Shape
    .area<{ x: number; y: number }>()
    .x((d) => d.x)
    .y0(210)
    .y1((d) => d.y)
    .curve(d3Shape.curveMonotoneX);

  const apiLinePath = lineGen(apiPoints) ?? '';
  const apiAreaPath = areaGen(apiPoints) ?? '';

  const serverLinePath = lineGen(serverPoints) ?? '';
  const serverAreaPath = areaGen(serverPoints) ?? '';

  const deployLinePath = lineGen(deployPoints) ?? '';
  const deployAreaPath = areaGen(deployPoints) ?? '';

  const errorLinePath = lineGen(errorPoints) ?? '';

  const hoveredData = hoverIndex !== null ? points[hoverIndex] : null;

  return (
    <div className="w-full bg-background border-b border-border">
      {/* Header bar of System Metrics — compact spacing */}
      <div className="px-5 py-3 flex items-center justify-between">
        <h3 className="text-xs sm:text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h3>

        {/* Timeframe Segmented Control (3M | 6M | 1Y) */}
        <div className="inline-flex items-center rounded-[6px] border border-border bg-background p-0.5 text-xs">
          {(['3M', '6M', '1Y'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => onTimeRangeChange(range)}
              className={`px-2.5 py-0.5 font-medium rounded-[4px] text-[11px] transition-colors cursor-pointer ${
                timeRange === range
                  ? 'bg-neutral-800 text-white shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Canvas Area — full bleed to right edge, no right padding */}
      <div className="w-full relative pl-3 sm:pl-4 pr-0 pb-2 pt-0">
        <svg
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          className="w-full h-[220px] sm:h-[260px] block overflow-visible select-none"
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const svgX = ((e.clientX - rect.left) / rect.width) * 1000;
            let bestDist = Infinity;
            let bestIdx = 0;
            points.forEach((p, idx) => {
              const dist = Math.abs(p.x - svgX);
              if (dist < bestDist) {
                bestDist = dist;
                bestIdx = idx;
              }
            });
            setHoverIndex(bestIdx);
          }}
        >
          <defs>
            {/* Deep Navy/Blue Gradient (API Requests) */}
            <linearGradient
              id={`${gradientId}-blue`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#1d4ed8" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.02" />
            </linearGradient>

            {/* Warm Burnt Orange Gradient (Active Servers) */}
            <linearGradient
              id={`${gradientId}-orange`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#c2410c" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#c2410c" stopOpacity="0.02" />
            </linearGradient>

            {/* Emerald Gradient (Deployments) */}
            <linearGradient
              id={`${gradientId}-green`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#059669" stopOpacity="0.30" />
              <stop offset="100%" stopColor="#059669" stopOpacity="0.01" />
            </linearGradient>
          </defs>

          {/* 5 Dashed/Dotted Horizontal Grid Lines — spanning to x=1000 */}
          {[
            { val: 2400, y: 18 },
            { val: 1800, y: 66 },
            { val: 1200, y: 114 },
            { val: 600, y: 162 },
            { val: 0, y: 210 },
          ].map((grid) => (
            <g key={grid.val}>
              <text
                x="32"
                y={grid.y + 3.5}
                textAnchor="end"
                className="fill-zinc-500 font-mono text-[10px]"
              >
                {grid.val}
              </text>
              <line
                x1="38"
                y1={grid.y}
                x2="1000"
                y2={grid.y}
                stroke="rgba(255, 255, 255, 0.08)"
                strokeDasharray="2 3"
                strokeWidth="1"
              />
            </g>
          ))}

          {/* Area Fills with Glow Gradients */}
          <path d={apiAreaPath} fill={`url(#${gradientId}-blue)`} />
          <path d={serverAreaPath} fill={`url(#${gradientId}-orange)`} />
          <path d={deployAreaPath} fill={`url(#${gradientId}-green)`} />

          {/* Precision Stroke Lines */}
          <path
            d={apiLinePath}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={serverLinePath}
            fill="none"
            stroke="#ea580c"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={deployLinePath}
            fill="none"
            stroke="#10b981"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d={errorLinePath}
            fill="none"
            stroke="#ef4444"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* X Axis Month Labels */}
          <text
            x="380"
            y="228"
            textAnchor="middle"
            className="fill-zinc-500 font-sans text-[10px]"
          >
            July
          </text>
          <text
            x="740"
            y="228"
            textAnchor="middle"
            className="fill-zinc-500 font-sans text-[10px]"
          >
            August
          </text>

          {/* Vertical Hairline Crosshair on Hover */}
          {hoveredData ? (
            <g>
              <line
                x1={hoveredData.x}
                y1="18"
                x2={hoveredData.x}
                y2="210"
                stroke="#71717a"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              <circle
                cx={hoveredData.x}
                cy={valToY(hoveredData.api)}
                r="3.5"
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle
                cx={hoveredData.x}
                cy={valToY(hoveredData.servers)}
                r="3.5"
                fill="#ea580c"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
              <circle
                cx={hoveredData.x}
                cy={valToY(hoveredData.deploys)}
                r="3.5"
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth="1.5"
              />
            </g>
          ) : null}
        </svg>

        {/* Floating Tooltip during Hover */}
        {hoveredData ? (
          <div
            style={{
              left: `${Math.min(84, Math.max(16, (hoveredData.x / 1000) * 100))}%`,
              top: '16px',
            }}
            className="absolute pointer-events-none -translate-x-1/2 rounded-[6px] border border-border bg-neutral-950/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md space-y-1 z-20 min-w-36"
          >
            <div className="font-semibold text-zinc-300 border-b border-border/60 pb-0.5 text-[10px]">
              {hoveredData.date}
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="size-2 rounded-xs bg-[#2563eb]" />
                <span>API Requests</span>
              </div>
              <span className="font-mono text-zinc-200 font-medium">
                {Math.round(hoveredData.api * multiplier).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="size-2 rounded-xs bg-[#ea580c]" />
                <span>Active Servers</span>
              </div>
              <span className="font-mono text-zinc-200 font-medium">
                {Math.round(hoveredData.servers * multiplier).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="size-2 rounded-xs bg-[#10b981]" />
                <span>Deployments</span>
              </div>
              <span className="font-mono text-zinc-200 font-medium">
                {Math.round(hoveredData.deploys * multiplier).toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <div className="flex items-center gap-1.5 text-zinc-400">
                <span className="size-2 rounded-xs bg-[#ef4444]" />
                <span>Error Rate</span>
              </div>
              <span className="font-mono text-zinc-200 font-medium">
                {hoveredData.error.toFixed(2)}%
              </span>
            </div>
          </div>
        ) : null}

        {/* Centered Legend below Chart — compact spacing matching reference */}
        <div className="flex flex-wrap items-center justify-center gap-5 pt-1 pb-2 text-[11px] text-muted-foreground select-none">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-[1px] bg-[#2563eb]" />
            <span className="text-zinc-300 font-medium text-[11px]">
              API Requests
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-[1px] bg-[#ea580c]" />
            <span className="text-zinc-300 font-medium text-[11px]">
              Active Servers
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-[1px] bg-[#10b981]" />
            <span className="text-zinc-300 font-medium text-[11px]">
              Deployments
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-[1px] bg-[#ef4444]" />
            <span className="text-zinc-300 font-medium text-[11px]">
              Error Rate
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DashboardOverview({
  stats,
  chartTitle = 'System Metrics',
  chartDescription = 'Total for the last 3 months',
  chartBadge = 'LIVE STREAM',
  chartData,
  chartConfig,
  showRecent = false,
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
  const [timeRange, setTimeRange] = useState<'3M' | '6M' | '1Y'>('3M');

  // If custom stats provided (e.g. from AdminOverview), use them; otherwise use ForgeUI stats
  const activeStats = stats && stats.length > 0 ? stats : FORGE_DEFAULT_STATS;

  const defaultColors = ['blue', 'orange', 'green', 'red'];
  const defaultSparklines = [
    [35, 45, 60, 50, 75, 65, 80, 70, 95, 88],
    [40, 50, 45, 60, 70, 85, 95, 80, 75, 90],
    [15, 20, 25, 35, 45, 60, 80, 70, 90, 100],
    [60, 55, 45, 40, 35, 30, 25, 20, 15, 12],
  ];

  return (
    <div className="w-full bg-background text-foreground select-none">
      {/* SECTION 1: Top KPI Metric Strip — Divided by 1px vertical borders */}
      <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
        {activeStats.slice(0, 4).map((stat, index) => {
          const StatIcon = stat.icon ?? (index === 0 ? ArrowLeftRight : index === 1 ? Clock : index === 2 ? Layers : AlertTriangle);
          const TrendIcon = stat.isNegative ? ArrowDownRight : ArrowUpRight;
          const statColor = stat.color ?? defaultColors[index % 4];
          const sparklineBars =
            stat.sparkline ?? defaultSparklines[index % 4];

          return (
            <div
              key={stat.label}
              className="flex items-start justify-between p-5 bg-background hover:bg-neutral-900/20 transition-colors group"
            >
              <div className="flex flex-col justify-between h-full min-w-0 pr-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                  {StatIcon ? <StatIcon className="size-3.5 shrink-0" /> : null}
                  <span className="truncate">{stat.label}</span>
                </div>
                <div className="mt-2 text-2xl sm:text-[28px] font-semibold tabular-nums tracking-tight text-foreground font-sans">
                  {stat.value}
                </div>
                {stat.delta ? (
                  <div className="mt-1 flex items-center gap-1 text-xs">
                    <TrendIcon
                      className={`size-3 shrink-0 ${
                        stat.isNegative ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    />
                    <span
                      className={`font-medium tabular-nums ${
                        stat.isNegative ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {stat.delta}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground ml-0.5">
                      {stat.subtext ?? 'vs last month'}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Signature Micro Bar Sparkline */}
              <MicroBarSparkline
                bars={sparklineBars}
                color={statColor}
              />
            </div>
          );
        })}
      </div>

      {/* SECTION 2: System Metrics Chart — Divided by 1px horizontal borders */}
      <SystemMetricsChart
        title={chartTitle}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
      />

      {/* SECTION 3: API Logs Table — Divided by 1px horizontal & vertical borders */}
      {showRecent ? (
        <div className="w-full grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-border border-b border-border">
          <div className="lg:col-span-2">
            <DashboardDataTable />
          </div>
          <div className="p-4 bg-background">
            <RecentActivityCard
              title={recentTitle}
              items={recentItems}
            />
          </div>
        </div>
      ) : (
        <DashboardDataTable />
      )}
    </div>
  );
}
