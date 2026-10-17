'use client';

import { StatusPill, type Tone } from '@/components/dashboard/PageChrome';

const STATUS_CONFIG: Record<
  string,
  { label: string; tone: Tone; pulse?: boolean }
> = {
  pending: { label: 'Pending', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'info' },
  starting: { label: 'Starting', tone: 'info', pulse: true },
  running: { label: 'Applying', tone: 'info', pulse: true },
  resuming: { label: 'Resuming', tone: 'info', pulse: true },
  waiting_for_human: { label: 'Needs you', tone: 'warning' },
  captcha_blocked: { label: 'Captcha', tone: 'warning' },
  login_required: { label: 'Login required', tone: 'warning' },
  browser_disconnected: { label: 'Disconnected', tone: 'danger' },
  submitted: { label: 'Applied', tone: 'success' },
  already_applied: { label: 'Already applied', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  timed_out: { label: 'Timed out', tone: 'danger' },
  skipped: { label: 'Skipped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export function ApplicationStatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? {
    label: status.replaceAll('_', ' '),
    tone: 'neutral' as const,
  };
  return (
    <StatusPill tone={config.tone} pulse={config.pulse}>
      {config.label}
    </StatusPill>
  );
}
