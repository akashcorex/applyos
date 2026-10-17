'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck,
  RiCompass3Line,
  FileText,
  Loader2,
  Send,
  Zap,
} from '@applyso/ui/icons';

import { ApplicationModal } from '@/components/applications/ApplicationModal';
import { ApplicationsTable } from '@/components/applications/ApplicationsTable';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import {
  EmptyState,
  NoticeBar,
  SearchField,
  SectionHeader,
  StatStrip,
  type Stat,
} from '@/components/dashboard/PageChrome';
import type { ProfileSummary } from '@/components/dashboard/profile-types';
import {
  countByCategory,
  dailyActivity,
  isInterview,
  sumLast,
  type ApplicationRow,
} from '@/lib/application-stats';
import { fetchBillingMe, planLabel, type BillingMe } from '@/lib/billing';
import { useApplications } from '@/lib/use-applications';

type Range = '7D' | '30D' | '90D';

const RANGE_DAYS: Record<Range, number> = { '7D': 7, '30D': 30, '90D': 90 };

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

export function DashboardOverview() {
  const { rows, loading, error } = useApplications(15000);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [range, setRange] = useState<Range>('30D');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ApplicationRow | null>(null);

  useEffect(() => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    void fetch(
      `/api/profiles/summary?timeZone=${encodeURIComponent(timeZone)}`,
      {
        cache: 'no-store',
      },
    )
      .then(async (res) =>
        res.ok ? ((await res.json()) as ProfileSummary) : null,
      )
      .then(setSummary)
      .catch(() => undefined);
    void fetchBillingMe().then(setBilling);
  }, []);

  const counts = useMemo(() => countByCategory(rows), [rows]);
  const recent = useMemo(() => dailyActivity(rows, 14), [rows]);
  const chart = useMemo(
    () => dailyActivity(rows, RANGE_DAYS[range]),
    [rows, range],
  );

  const totals = summary?.activity.totals;
  const submitted = totals?.submitted ?? counts.submitted;
  const interviews = totals
    ? (totals.interviews ?? 0) + (totals.offers ?? 0)
    : rows.filter(isInterview).length;
  const responseRate =
    submitted > 0 ? Math.round((interviews / submitted) * 100) : null;
  const sentThisWeek = sumLast(recent.submitted, 7);
  const startedThisWeek = sumLast(recent.started, 7);

  const stats: Stat[] = [
    {
      label: 'Applications Sent',
      value: submitted.toLocaleString(),
      icon: Send,
      delta: `+${sentThisWeek}`,
      deltaTone: sentThisWeek > 0 ? 'positive' : 'neutral',
      subtext: 'this week',
      sparkline: recent.submitted.slice(-10),
      color: 'blue',
    },
    {
      label: 'In Progress',
      value: counts.running.toLocaleString(),
      icon: Loader2,
      delta: `+${startedThisWeek}`,
      deltaTone: startedThisWeek > 0 ? 'positive' : 'neutral',
      subtext: `started this week · ${plural(totals?.activeWorkflows ?? 0, 'active run')}`,
      sparkline: recent.started.slice(-10),
      color: 'orange',
      href: '/dashboard/workflows',
    },
    {
      label: 'Interviews',
      value: interviews.toLocaleString(),
      icon: CalendarCheck,
      delta: responseRate === null ? undefined : `${responseRate}%`,
      deltaTone: responseRate ? 'positive' : 'neutral',
      subtext:
        responseRate === null
          ? 'mark outcomes in Job Tracker'
          : `response rate · ${plural(totals?.offers ?? 0, 'offer')}`,
      sparkline: recent.interviews.slice(-10),
      color: 'green',
    },
    {
      label: 'Needs Attention',
      value: counts.attention.toLocaleString(),
      icon: AlertTriangle,
      delta: counts.attention > 0 ? 'Action needed' : undefined,
      deltaTone: counts.attention > 0 ? 'negative' : 'neutral',
      subtext:
        counts.attention > 0
          ? 'captcha, login or review'
          : 'agent is unblocked',
      sparkline: recent.attention.slice(-10),
      color: 'red',
      href: '/dashboard/applications?filter=attention',
    },
  ];

  const cycle = billing?.cycle;
  const quotaOut = cycle ? cycle.remaining <= 0 : false;

  return (
    <div className="w-full bg-background text-foreground">
      {cycle ? (
        <NoticeBar
          tone={quotaOut ? 'warning' : 'neutral'}
          icon={Zap}
          action={
            quotaOut ? (
              <Button asChild size="sm">
                <Link href="/dashboard/settings/billing">
                  Get more applications
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/discovery">
                  Find jobs
                  <ArrowRight />
                </Link>
              </Button>
            )
          }
        >
          {planLabel(billing.plan)} plan · {cycle.submitted} of {cycle.limit}{' '}
          applications used this cycle
          {cycle.end
            ? ` · resets ${new Date(cycle.end).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}`
            : ''}
        </NoticeBar>
      ) : null}

      {error ? (
        <NoticeBar tone="danger" icon={AlertTriangle}>
          {error}
        </NoticeBar>
      ) : null}

      <StatStrip stats={stats} loading={loading && rows.length === 0} />

      <ActivityChart
        title="Application Activity"
        days={chart.days}
        loading={loading && rows.length === 0}
        ranges={[
          { value: '7D', label: '7D' },
          { value: '30D', label: '30D' },
          { value: '90D', label: '90D' },
        ]}
        range={range}
        onRangeChange={setRange}
        emptyLabel="No applications in this range yet"
        series={[
          {
            key: 'started',
            label: 'Started',
            color: '#2563eb',
            values: chart.started,
          },
          {
            key: 'submitted',
            label: 'Submitted',
            color: '#10b981',
            values: chart.submitted,
          },
          {
            key: 'interviews',
            label: 'Interviews',
            color: '#ea580c',
            values: chart.interviews,
          },
          {
            key: 'failed',
            label: 'Failed',
            color: '#ef4444',
            values: chart.failed,
            fill: false,
          },
        ]}
      />

      <section
        aria-label="Recent applications"
        className="border-b border-border"
      >
        <SectionHeader
          icon={FileText}
          title="Recent Applications"
          meta={rows.length > 0 ? `${rows.length} tracked` : undefined}
          actions={
            <>
              <SearchField
                value={search}
                onChange={setSearch}
                label="Search applications"
                placeholder="Search role, company…"
              />
              <Button asChild size="sm" variant="outline">
                <Link href="/dashboard/applications">View all</Link>
              </Button>
            </>
          }
        />
        <ApplicationsTable
          rows={rows}
          loading={loading}
          search={search}
          limit={8}
          onOpen={setOpen}
          empty={
            <EmptyState
              icon={RiCompass3Line}
              title="No applications yet"
              description="Find roles that match your profile. ApplyOS fills and submits the forms, and every run shows up here."
              action={
                <Button asChild size="sm">
                  <Link href="/dashboard/discovery">
                    Discover jobs
                    <ArrowRight />
                  </Link>
                </Button>
              }
            />
          }
        />
      </section>

      {open ? (
        <ApplicationModal
          applicationId={open.id}
          jobTitle={open.jobTitle ?? undefined}
          companyName={open.companyName ?? undefined}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </div>
  );
}
