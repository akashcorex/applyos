'use client';

import { useId, useState } from 'react';

import * as d3Shape from 'd3-shape';

import {
  SegmentedControl,
  type SegmentOption,
} from '@/components/dashboard/PageChrome';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
  fill?: boolean;
}

const LEFT = 38;
const RIGHT = 1000;
const TOP = 18;
const BASE = 210;
const TICK_FRACTIONS = [1, 0.75, 0.5, 0.25, 0];

function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function ActivityChart<R extends string>({
  title,
  days,
  series,
  ranges,
  range,
  onRangeChange,
  loading = false,
  emptyLabel = 'No activity in this range yet',
}: {
  title: string;
  days: string[];
  series: ChartSeries[];
  ranges?: SegmentOption<R>[];
  range?: R;
  onRangeChange?: (range: R) => void;
  loading?: boolean;
  emptyLabel?: string;
}) {
  const gradientId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const peak = Math.max(0, ...series.flatMap((item) => item.values));
  const maxValue = Math.max(4, Math.ceil(peak / 4) * 4);
  const step = days.length > 1 ? (RIGHT - LEFT) / (days.length - 1) : 0;
  const xAt = (i: number) => LEFT + i * step;
  const yAt = (value: number) => BASE - (value / maxValue) * (BASE - TOP);

  const lineGen = d3Shape
    .line<number>()
    .x((_, i) => xAt(i))
    .y((value) => yAt(value))
    .curve(d3Shape.curveMonotoneX);
  const areaGen = d3Shape
    .area<number>()
    .x((_, i) => xAt(i))
    .y0(BASE)
    .y1((value) => yAt(value))
    .curve(d3Shape.curveMonotoneX);

  const labelEvery = Math.max(1, Math.ceil(days.length / 6));
  const isEmpty = !loading && peak === 0;
  const hovered = hoverIndex !== null && !isEmpty ? hoverIndex : null;

  return (
    <div className="w-full border-b border-border bg-background">
      <div className="flex items-center justify-between gap-3 px-6 py-3">
        <h3 className="text-xs font-semibold tracking-tight text-foreground sm:text-sm">
          {title}
        </h3>
        {ranges && range && onRangeChange ? (
          <SegmentedControl
            label="Chart range"
            options={ranges}
            value={range}
            onChange={onRangeChange}
          />
        ) : null}
      </div>

      <div className="relative w-full pb-2 pl-3 pr-0 sm:pl-4">
        <svg
          viewBox="0 0 1000 240"
          preserveAspectRatio="none"
          role="img"
          aria-label={`${title} chart`}
          className={`block h-[220px] w-full select-none overflow-visible sm:h-[260px] ${
            loading ? 'animate-pulse opacity-40' : ''
          }`}
          onMouseLeave={() => setHoverIndex(null)}
          onMouseMove={(event) => {
            if (days.length === 0) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const svgX = ((event.clientX - rect.left) / rect.width) * 1000;
            const index = step > 0 ? Math.round((svgX - LEFT) / step) : 0;
            setHoverIndex(Math.min(days.length - 1, Math.max(0, index)));
          }}
        >
          <defs>
            {series.map((item) => (
              <linearGradient
                key={item.key}
                id={`${gradientId}-${item.key}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={item.color} stopOpacity="0.32" />
                <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
              </linearGradient>
            ))}
          </defs>

          {TICK_FRACTIONS.map((fraction) => {
            const value = Math.round(maxValue * fraction);
            const y = yAt(value);
            return (
              <g key={fraction}>
                <text
                  x="32"
                  y={y + 3.5}
                  textAnchor="end"
                  className="fill-muted-foreground font-mono text-[10px]"
                >
                  {value}
                </text>
                <line
                  x1={LEFT}
                  y1={y}
                  x2={RIGHT}
                  y2={y}
                  className="stroke-border"
                  strokeDasharray="2 3"
                  strokeWidth="1"
                />
              </g>
            );
          })}

          {series.map((item) =>
            item.fill === false ? null : (
              <path
                key={`${item.key}-area`}
                d={areaGen(item.values) ?? ''}
                fill={`url(#${gradientId}-${item.key})`}
              />
            ),
          )}
          {series.map((item) => (
            <path
              key={`${item.key}-line`}
              d={lineGen(item.values) ?? ''}
              fill="none"
              stroke={item.color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}

          {days.map((day, i) =>
            i % labelEvery === 0 || i === days.length - 1 ? (
              <text
                key={day}
                x={xAt(i)}
                y="228"
                textAnchor={
                  i === 0 ? 'start' : i === days.length - 1 ? 'end' : 'middle'
                }
                className="fill-muted-foreground font-sans text-[10px]"
              >
                {dayLabel(day)}
              </text>
            ) : null,
          )}

          {hovered !== null ? (
            <g>
              <line
                x1={xAt(hovered)}
                y1={TOP}
                x2={xAt(hovered)}
                y2={BASE}
                stroke="#71717a"
                strokeDasharray="2 2"
                strokeWidth="1"
              />
              {series.map((item) => (
                <circle
                  key={item.key}
                  cx={xAt(hovered)}
                  cy={yAt(item.values[hovered] ?? 0)}
                  r="3.5"
                  fill={item.color}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ) : null}
        </svg>

        {isEmpty ? (
          <p className="pointer-events-none absolute inset-x-0 top-[42%] text-center font-mono text-[11px] text-muted-foreground">
            {emptyLabel}
          </p>
        ) : null}

        {hovered !== null ? (
          <div
            style={{
              left: `${Math.min(84, Math.max(16, (xAt(hovered) / 1000) * 100))}%`,
              top: '16px',
            }}
            className="pointer-events-none absolute z-20 min-w-36 -translate-x-1/2 space-y-1 rounded-[6px] border border-border bg-popover/95 px-3 py-1.5 text-xs shadow-xl backdrop-blur-md"
          >
            <div className="border-b border-border/60 pb-0.5 text-[10px] font-semibold text-foreground">
              {dayLabel(days[hovered])}
            </div>
            {series.map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between gap-3 text-[10px]"
              >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="size-2 rounded-xs"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.label}</span>
                </div>
                <span className="font-mono font-medium text-foreground">
                  {item.values[hovered] ?? 0}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="flex select-none flex-wrap items-center justify-center gap-5 pb-2 pt-1 text-[11px]">
          {series.map((item) => (
            <div key={item.key} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-[1px]"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-[11px] font-medium text-foreground/80">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
