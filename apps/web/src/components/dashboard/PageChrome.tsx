'use client';

import type { ComponentType, ReactNode } from 'react';

import Link from 'next/link';

import { ArrowDownRight, ArrowUpRight, Search } from '@applyso/ui/icons';

type IconType = ComponentType<{ className?: string }>;

export function SearchField({
  value,
  onChange,
  placeholder,
  label,
  onEnter,
  className = 'w-full sm:w-64',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
  onEnter?: () => void;
  className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onEnter?.();
        }}
        className="h-8 w-full rounded-[6px] border border-border bg-background pl-8 pr-3 text-xs text-foreground transition-colors placeholder:text-muted-foreground focus:border-neutral-500 focus:outline-none"
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-4 border-b border-border bg-background px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function SectionHeader({
  icon: Icon,
  title,
  meta,
  actions,
}: {
  icon?: IconType;
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border bg-background px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="size-4 shrink-0 text-primary" /> : null}
        <h2 className="truncate text-sm font-medium text-primary">{title}</h2>
        {meta ? (
          <span className="truncate font-mono text-xs text-muted-foreground">
            {meta}
          </span>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export type StatColor = 'blue' | 'orange' | 'green' | 'red' | 'purple';

const BAR_COLORS: Record<StatColor, string> = {
  blue: 'bg-[#3b82f6]/85',
  orange: 'bg-[#f97316]/85',
  green: 'bg-[#10b981]/85',
  red: 'bg-[#ef4444]/85',
  purple: 'bg-[#a855f7]/85',
};

function MicroBarSparkline({
  values,
  color,
}: {
  values: number[];
  color: StatColor;
}) {
  const max = Math.max(...values, 0);
  return (
    <div
      aria-hidden="true"
      className="mb-0.5 flex h-9 shrink-0 items-end gap-[3px] self-end"
    >
      {values.map((value, i) => (
        <div
          key={i}
          style={{
            height: `${max > 0 ? Math.max(12, (value / max) * 100) : 12}%`,
          }}
          className={`w-[3.5px] rounded-[1px] ${BAR_COLORS[color]} ${
            value > 0 ? '' : 'opacity-30'
          }`}
        />
      ))}
    </div>
  );
}

export interface Stat {
  label: string;
  value: string;
  icon: IconType;
  delta?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  subtext?: string;
  sparkline?: number[];
  color?: StatColor;
  href?: string;
}

function StatCell({ stat, loading }: { stat: Stat; loading: boolean }) {
  const Icon = stat.icon;
  const tone = stat.deltaTone ?? 'neutral';
  const TrendIcon =
    tone === 'positive'
      ? ArrowUpRight
      : tone === 'negative'
        ? ArrowDownRight
        : null;
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-500 dark:text-emerald-400'
      : tone === 'negative'
        ? 'text-red-500 dark:text-red-400'
        : 'text-muted-foreground';

  const body = (
    <>
      <div className="flex h-full min-w-0 flex-col justify-between pr-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 shrink-0" />
          <span className="truncate text-primary">{stat.label}</span>
        </div>
        {loading ? (
          <div className="mt-3 h-7 w-16 animate-pulse rounded-[4px] bg-muted" />
        ) : (
          <div className="mt-2 font-sans text-2xl font-semibold tracking-tight tabular-nums text-foreground sm:text-[28px]">
            {stat.value}
          </div>
        )}
        {stat.delta || stat.subtext ? (
          <div className="mt-1 flex min-w-0 items-center gap-1 text-xs">
            {TrendIcon && stat.delta ? (
              <TrendIcon className={`size-3 shrink-0 ${toneClass}`} />
            ) : null}
            {stat.delta ? (
              <span className={`font-medium tabular-nums ${toneClass}`}>
                {stat.delta}
              </span>
            ) : null}
            {stat.subtext ? (
              <span className="ml-0.5 truncate text-[11px] text-muted-foreground">
                {stat.subtext}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
      {stat.sparkline && !loading ? (
        <MicroBarSparkline
          values={stat.sparkline}
          color={stat.color ?? 'blue'}
        />
      ) : null}
    </>
  );

  const className =
    'flex items-start justify-between bg-background p-5 sm:px-6 transition-colors hover:bg-muted/30';
  if (stat.href) {
    return (
      <Link href={stat.href} className={className}>
        {body}
      </Link>
    );
  }
  return <div className={className}>{body}</div>;
}

const STRIP_COLUMNS: Record<number, string> = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

export function StatStrip({
  stats,
  loading = false,
}: {
  stats: Stat[];
  loading?: boolean;
}) {
  return (
    <div
      className={`grid w-full grid-cols-1 gap-px border-b border-border bg-border ${
        STRIP_COLUMNS[stats.length] ?? STRIP_COLUMNS[4]
      }`}
    >
      {stats.map((stat) => (
        <StatCell key={stat.label} stat={stat} loading={loading} />
      ))}
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full items-center overflow-x-auto rounded-[6px] border border-border bg-background p-0.5 text-xs"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex shrink-0 items-center gap-1.5 rounded-[4px] px-2.5 py-1 text-[11px] font-medium transition-colors ${
              active
                ? 'bg-neutral-900 text-white shadow-xs dark:bg-neutral-800'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option.label}
            {typeof option.count === 'number' ? (
              <span
                className={`font-mono text-[10px] tabular-nums ${
                  active ? 'text-white/70' : 'text-muted-foreground/80'
                }`}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const PILL_TONES: Record<Tone, string> = {
  neutral: 'border-border bg-muted/50 text-muted-foreground',
  info: 'border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400',
  success:
    'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning:
    'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400',
  danger: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
};

export function StatusPill({
  tone,
  children,
  title,
  pulse = false,
}: {
  tone: Tone;
  children: ReactNode;
  title?: string;
  pulse?: boolean;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wide ${PILL_TONES[tone]}`}
    >
      {pulse ? (
        <span className="size-1.5 animate-pulse rounded-full bg-current" />
      ) : null}
      {children}
    </span>
  );
}

const NOTICE_TONES: Record<Tone, string> = {
  neutral: 'border-border bg-secondary/30 text-muted-foreground',
  info: 'border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-200',
  success:
    'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-200',
  warning:
    'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-200',
  danger: 'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300',
};

export function NoticeBar({
  tone = 'neutral',
  icon: Icon,
  children,
  action,
}: {
  tone?: Tone;
  icon?: IconType;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={`flex flex-col gap-3 border-b px-6 py-2.5 sm:flex-row sm:items-center ${NOTICE_TONES[tone]}`}
    >
      {Icon ? <Icon className="size-4 shrink-0" /> : null}
      <div className="min-w-0 flex-1 text-xs font-medium">{children}</div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: IconType;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="flex size-9 items-center justify-center rounded-[8px] border border-border bg-card">
        <Icon className="size-4 text-muted-foreground" />
      </span>
      <p className="mt-1 text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
