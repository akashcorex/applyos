'use client';

import { Suspense, useCallback, useMemo, useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  RiCompass3Line,
  FileText,
  Layers,
  Loader2,
} from '@applyso/ui/icons';

import { ApplicationModal } from '@/components/applications/ApplicationModal';
import { ApplicationsTable } from '@/components/applications/ApplicationsTable';
import {
  EmptyState,
  NoticeBar,
  PageHeader,
  SearchField,
  SectionHeader,
  SegmentedControl,
  StatStrip,
} from '@/components/dashboard/PageChrome';
import {
  applicationCategory,
  countByCategory,
  dailyActivity,
  type ApplicationCategory,
  type ApplicationRow,
} from '@/lib/application-stats';
import { useApplications } from '@/lib/use-applications';

import { SURFACE_CARD } from '../dashboard/surfaces';

type Filter = ApplicationCategory | 'all';

const FILTERS: Filter[] = [
  'all',
  'running',
  'attention',
  'submitted',
  'closed',
];

const FILTER_LABELS: Record<Filter, string> = {
  all: 'All',
  running: 'In progress',
  attention: 'Needs you',
  submitted: 'Applied',
  closed: 'Closed',
};

const EMPTY_COPY: Record<Filter, string> = {
  all: 'Pick roles in Discover Jobs and the agent will apply for you. Every run lands here.',
  running: 'Nothing is being applied to right now.',
  attention: 'Nothing is blocked. The agent will flag captchas or logins here.',
  submitted: 'No submitted applications yet.',
  closed: 'No failed, skipped, or cancelled applications.',
};

function isFilter(value: string | null): value is Filter {
  return value !== null && (FILTERS as string[]).includes(value);
}

function ApplicationsPanelContent() {
  const { rows, loading, error } = useApplications(5000);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedFilter = searchParams.get('filter');
  const filter: Filter = isFilter(requestedFilter) ? requestedFilter : 'all';
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<ApplicationRow | null>(null);

  const setFilter = useCallback(
    (next: Filter) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === 'all') params.delete('filter');
      else params.set('filter', next);
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const counts = useMemo(() => countByCategory(rows), [rows]);
  const daily = useMemo(() => dailyActivity(rows, 10), [rows]);
  const filtered = useMemo(
    () =>
      filter === 'all'
        ? rows
        : rows.filter((row) => applicationCategory(row.status) === filter),
    [rows, filter],
  );

  return (
    <div className="flex w-full flex-col gap-6 text-foreground">
      <PageHeader
        variant="plain"
        title="Applications"
        description="Every job the agent applies to. Watch it work live and step in when it needs you."
        actions={
          <Button asChild size="sm">
            <Link href="/dashboard/discovery">
              Discover jobs
              <ArrowRight />
            </Link>
          </Button>
        }
      />

      {counts.attention > 0 ? (
        <NoticeBar
          variant="island"
          tone="warning"
          icon={AlertTriangle}
          action={
            filter === 'attention' ? null : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setFilter('attention')}
              >
                Show them
              </Button>
            )
          }
        >
          {counts.attention === 1
            ? '1 application is waiting on you.'
            : `${counts.attention} applications are waiting on you.`}{' '}
          Open it, solve the captcha or log in, and the agent picks up where it
          stopped.
        </NoticeBar>
      ) : null}

      {error ? (
        <NoticeBar variant="island" tone="danger" icon={AlertTriangle}>
          {error}
        </NoticeBar>
      ) : null}

      <StatStrip
        variant="island"
        loading={loading && rows.length === 0}
        stats={[
          {
            label: 'Tracked',
            value: String(counts.all),
            icon: Layers,
            subtext: 'most recent 100',
            sparkline: daily.started,
            color: 'blue',
          },
          {
            label: 'In Progress',
            value: String(counts.running),
            icon: Loader2,
            subtext: 'agent is applying',
            color: 'orange',
          },
          {
            label: 'Needs You',
            value: String(counts.attention),
            icon: AlertTriangle,
            deltaTone: counts.attention > 0 ? 'negative' : 'neutral',
            delta: counts.attention > 0 ? 'Action needed' : undefined,
            subtext: counts.attention > 0 ? undefined : 'nothing blocked',
            sparkline: daily.attention,
            color: 'red',
          },
          {
            label: 'Applied',
            value: String(counts.submitted),
            icon: CheckCircle2,
            subtext: `${counts.closed} closed`,
            sparkline: daily.submitted,
            color: 'green',
          },
        ]}
      />

      <section
        aria-label="Applications list"
        className={`overflow-hidden ${SURFACE_CARD}`}
      >
        <SectionHeader
          variant="card"
          icon={FileText}
          title={`${FILTER_LABELS[filter]} applications`}
          meta={`${filtered.length}`}
          actions={
            <>
              <SegmentedControl
                label="Filter applications"
                value={filter}
                onChange={setFilter}
                options={FILTERS.map((value) => ({
                  value,
                  label: FILTER_LABELS[value],
                  count: counts[value],
                }))}
              />
              <SearchField
                value={search}
                onChange={setSearch}
                label="Search applications"
                placeholder="Search role, company…"
                className="w-full sm:w-56"
              />
            </>
          }
        />
        <ApplicationsTable
          rows={filtered}
          loading={loading}
          search={search}
          onOpen={setOpen}
          empty={
            <EmptyState
              icon={filter === 'all' ? RiCompass3Line : CheckCircle2}
              title={
                filter === 'all'
                  ? 'No applications yet'
                  : `No ${FILTER_LABELS[filter].toLowerCase()} applications`
              }
              description={EMPTY_COPY[filter]}
              action={
                filter === 'all' ? (
                  <Button asChild size="sm">
                    <Link href="/dashboard/discovery">
                      Discover jobs
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : null
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

export function ApplicationsPanel() {
  return (
    <Suspense fallback={<StatStrip variant="island" loading stats={[]} />}>
      <ApplicationsPanelContent />
    </Suspense>
  );
}
