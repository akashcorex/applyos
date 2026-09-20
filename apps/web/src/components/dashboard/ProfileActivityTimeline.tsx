'use client';

import { Briefcase, FileText, Send, Sparkles, Workflow } from 'lucide-react';

import type { ProfileActivityKind } from '@applyso/validation';

import type { ProfileTimelineItem } from './profile-types';

const KIND_ICON: Record<ProfileActivityKind, typeof FileText> = {
  resume: FileText,
  match: Sparkles,
  workflow: Workflow,
  application: Send,
};

function dayLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

/**
 * Career activity timeline — replaces the old contribution-style heatmap.
 * Communicates job-search activity (resumes, matches, applications,
 * workflows), not developer commits.
 */
export function ProfileActivityTimeline({
  items,
}: {
  items: ProfileTimelineItem[];
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-[12px] border border-border bg-card p-5 text-center">
        <Briefcase className="mx-auto h-5 w-5 text-slate-400" />
        <p className="mt-2 text-[13px] font-medium">No activity yet</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload a resume and start a job search — your career activity will
          show up here.
        </p>
      </div>
    );
  }

  const groups = new Map<string, ProfileTimelineItem[]>();
  for (const item of items) {
    const key = dayLabel(item.at);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return (
    <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
      <ol className="space-y-5">
        {[...groups.entries()].map(([day, dayItems]) => (
          <li key={day}>
            <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              {day}
            </p>
            <ul className="mt-2 space-y-2">
              {dayItems.map((item, index) => {
                const Icon = KIND_ICON[item.kind] ?? FileText;
                return (
                  <li
                    key={`${item.at}-${index}`}
                    className="flex items-center gap-2.5 text-[13px]"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] bg-muted">
                      <Icon className="h-3 w-3 text-slate-500 dark:text-[#8a8f9d]" />
                    </span>
                    <span className="min-w-0 truncate text-slate-700 dark:text-[#c5c8d2]">
                      {item.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
