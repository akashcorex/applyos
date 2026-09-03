'use client';

import { Badge } from '@applyso/ui/badge';

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  queued: {
    label: 'Queued',
    className:
      'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  starting: {
    label: 'Starting',
    className:
      'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20',
  },
  running: {
    label: 'Applying…',
    className:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  },
  resuming: {
    label: 'Resuming…',
    className:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  waiting_for_human: {
    label: 'Attention Required',
    className:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  browser_disconnected: {
    label: 'Browser Disconnected',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  submitted: {
    label: 'Applied',
    className:
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20',
  },
  captcha_blocked: {
    label: 'Attention Required',
    className:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  login_required: {
    label: 'Login Required',
    className:
      'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20',
  },
  cancelled: {
    label: 'Cancelled',
    className:
      'bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  },
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status,
    className:
      'bg-slate-100 dark:bg-slate-800/40 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700',
  };
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
    </Badge>
  );
}
