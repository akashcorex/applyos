'use client';

import { useMemo, useState, type ReactNode } from 'react';

import {
  ArrowUpDown,
  Briefcase,
  ChevronRight,
  Clock,
  Globe,
  Sparkles,
  Workflow,
} from '@applyso/ui/icons';

import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import {
  applicationCategory,
  normalizeScore,
  relativeTime,
  type ApplicationRow,
} from '@/lib/application-stats';

type SortField = 'role' | 'status' | 'match' | 'updated';

const CATEGORY_ORDER = { attention: 0, running: 1, submitted: 2, closed: 3 };

function companyInitial(name?: string | null): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

function scoreClass(score: number): string {
  if (score >= 85) return 'text-emerald-500 dark:text-emerald-400';
  if (score >= 70) return 'text-sky-500 dark:text-sky-400';
  if (score >= 55) return 'text-amber-500 dark:text-amber-400';
  return 'text-muted-foreground';
}

function SortHeader({
  field,
  icon: Icon,
  label,
  onSort,
  className = '',
}: {
  field: SortField;
  icon: typeof Clock;
  label: string;
  onSort: (field: SortField) => void;
  className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 font-medium first:pl-6 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1.5 transition-colors hover:text-foreground"
      >
        <Icon className="size-3.5" />
        <span>{label}</span>
        <ArrowUpDown className="ml-0.5 size-3 opacity-60" />
      </button>
    </th>
  );
}

export function ApplicationsTable({
  rows,
  loading = false,
  search = '',
  limit,
  empty,
  onOpen,
}: {
  rows: ApplicationRow[];
  loading?: boolean;
  search?: string;
  limit?: number;
  empty: ReactNode;
  onOpen: (row: ApplicationRow) => void;
}) {
  const [sortField, setSortField] = useState<SortField>('updated');
  const [sortAsc, setSortAsc] = useState(false);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortAsc((current) => !current);
      return;
    }
    setSortField(field);
    setSortAsc(field === 'role');
  }

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? rows.filter((row) =>
          [row.jobTitle, row.companyName, row.location, row.atsType, row.status]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
      : rows;
    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'role') {
        cmp = (a.jobTitle ?? '').localeCompare(b.jobTitle ?? '');
      } else if (sortField === 'status') {
        cmp =
          CATEGORY_ORDER[applicationCategory(a.status)] -
          CATEGORY_ORDER[applicationCategory(b.status)];
      } else if (sortField === 'match') {
        cmp =
          (normalizeScore(a.matchScore) ?? -1) -
          (normalizeScore(b.matchScore) ?? -1);
      } else {
        cmp = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      }
      return sortAsc ? cmp : -cmp;
    });
    return typeof limit === 'number' ? sorted.slice(0, limit) : sorted;
  }, [rows, search, sortField, sortAsc, limit]);

  if (loading && rows.length === 0) {
    return (
      <div
        className="divide-y divide-border/60"
        aria-label="Loading applications"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex animate-pulse items-center gap-3 px-6 py-3.5"
          >
            <div className="size-7 rounded-[8px] bg-muted" />
            <div className="h-3 w-48 rounded bg-muted" />
            <div className="ml-auto h-3 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return search.trim() ? (
      <p className="px-6 py-10 text-center font-mono text-xs text-muted-foreground">
        No applications match “{search.trim()}”
      </p>
    ) : (
      <>{empty}</>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">
        <thead>
          <tr className="select-none border-y border-border text-muted-foreground">
            <SortHeader
              field="role"
              icon={Briefcase}
              label="Role"
              onSort={handleSort}
            />
            <SortHeader
              field="status"
              icon={Workflow}
              label="Status"
              onSort={handleSort}
            />
            <SortHeader
              field="match"
              icon={Sparkles}
              label="Match"
              onSort={handleSort}
            />
            <th className="hidden px-4 py-2.5 font-medium md:table-cell">
              <span className="flex items-center gap-1.5">
                <Globe className="size-3.5" />
                Source
              </span>
            </th>
            <SortHeader
              field="updated"
              icon={Clock}
              label="Updated"
              onSort={handleSort}
            />
            <th className="w-10 py-2.5 pr-6" aria-label="Open" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {visible.map((row) => {
            const score = normalizeScore(row.matchScore);
            const note =
              applicationCategory(row.status) === 'attention'
                ? row.interventionReason
                : row.status === 'failed' || row.status === 'timed_out'
                  ? row.errorDetail
                  : null;
            const sub = [row.companyName, row.location]
              .filter(Boolean)
              .join(' · ');
            return (
              <tr
                key={row.id}
                onClick={() => onOpen(row)}
                className="group cursor-pointer transition-colors hover:bg-muted/25"
              >
                <td className="max-w-[340px] py-3 pl-6 pr-4">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-7 shrink-0 items-center justify-center rounded-[8px] border border-border bg-card text-[11px] font-semibold text-foreground"
                    >
                      {companyInitial(row.companyName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {row.jobTitle || 'Untitled role'}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {sub || 'Company not recorded'}
                      </p>
                      {note ? (
                        <p
                          className={`mt-0.5 truncate text-[11px] ${
                            row.status === 'failed' ||
                            row.status === 'timed_out'
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                          title={note}
                        >
                          {note}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <ApplicationStatusBadge status={row.status} />
                </td>
                <td className="px-4 py-3 font-mono">
                  {score === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className={`font-medium ${scoreClass(score)}`}>
                      {score}%
                    </span>
                  )}
                </td>
                <td className="hidden px-4 py-3 capitalize text-muted-foreground md:table-cell">
                  {row.atsType?.replaceAll('_', ' ') || '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                  {relativeTime(row.updatedAt)}
                </td>
                <td className="py-3 pr-6 text-right">
                  <button
                    type="button"
                    aria-label={`Open ${row.jobTitle ?? 'application'}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(row);
                    }}
                    className="inline-flex size-7 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
