'use client';

import {
  Briefcase,
  FileText,
  Send,
  Sparkles,
  Workflow,
} from '@applyso/ui/icons';
import type { ProfileActivityKind } from '@applyso/validation';

import { SURFACE_CARD } from './surfaces';

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

function timeLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProfileActivityTimeline({
  items,
}: {
  items: ProfileTimelineItem[];
}) {
  const groups = new Map<string, ProfileTimelineItem[]>();
  for (const item of items) {
    const key = dayLabel(item.at);
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return (
    <section
      aria-label="Activity timeline"
      className={`w-full overflow-hidden ${SURFACE_CARD}`}
    >
      {/* ── Section Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-transparent">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Activity Timeline
          </h2>
          <span className="hidden sm:inline text-xs text-zinc-500 font-mono">
            · Real-time audit log of matches, applications, and updates
          </span>
        </div>
        <span className="text-xs font-mono text-zinc-400">
          {items.length} {items.length === 1 ? 'event' : 'events'} logged
        </span>
      </div>

      {/* ── Events List (Flush line-divided) ───────────────────── */}
      {items.length === 0 ? (
        <div className="px-6 sm:px-8 py-10 text-center space-y-2">
          <Briefcase className="mx-auto h-5 w-5 text-zinc-600" />
          <p className="text-xs font-mono text-muted-foreground">
            No activity logged yet. Upload a resume or apply to jobs to track
            your events.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {[...groups.entries()].map(([day, dayItems]) => (
            <div key={day}>
              <div className="bg-neutral-900/20 px-6 sm:px-8 py-2 text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-400 border-b border-border">
                {day}
              </div>
              <div className="divide-y divide-border">
                {dayItems.map((item, index) => {
                  const Icon = KIND_ICON[item.kind] ?? FileText;
                  return (
                    <div
                      key={`${item.at}-${index}`}
                      className="flex items-center justify-between px-6 sm:px-8 py-3 text-xs bg-background hover:bg-neutral-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[5px] border border-border bg-neutral-900/60">
                          <Icon className="h-3.5 w-3.5 text-zinc-400" />
                        </span>
                        <span className="truncate font-medium text-zinc-300">
                          {item.label}
                        </span>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {timeLabel(item.at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
