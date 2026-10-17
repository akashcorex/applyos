export interface ApplicationRow {
  id: string;
  status: string;
  jobTitle?: string | null;
  companyName?: string | null;
  location?: string | null;
  matchScore?: number | null;
  atsType?: string | null;
  outcome?: string | null;
  errorDetail?: string | null;
  interventionReason?: string | null;
  humanInterventionRequired?: boolean | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
}

export type ApplicationCategory =
  'running' | 'attention' | 'submitted' | 'closed';

const RUNNING = new Set([
  'pending',
  'queued',
  'starting',
  'running',
  'resuming',
]);
const ATTENTION = new Set([
  'waiting_for_human',
  'browser_disconnected',
  'captcha_blocked',
  'login_required',
]);
const SUBMITTED = new Set(['submitted', 'already_applied']);
const FAILED = new Set(['failed', 'timed_out']);

export function applicationCategory(status: string): ApplicationCategory {
  if (SUBMITTED.has(status)) return 'submitted';
  if (ATTENTION.has(status)) return 'attention';
  if (RUNNING.has(status)) return 'running';
  return 'closed';
}

export function countByCategory(
  rows: ApplicationRow[],
): Record<ApplicationCategory | 'all', number> {
  const counts = {
    all: rows.length,
    running: 0,
    attention: 0,
    submitted: 0,
    closed: 0,
  };
  for (const row of rows) counts[applicationCategory(row.status)] += 1;
  return counts;
}

export function isInterview(row: ApplicationRow): boolean {
  return row.outcome === 'interview' || row.outcome === 'offer';
}

export function normalizeScore(score?: number | null): number | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0) {
    return null;
  }
  return Math.round(score <= 1 ? score * 100 : score);
}

export function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DailyActivity {
  days: string[];
  started: number[];
  submitted: number[];
  interviews: number[];
  failed: number[];
  attention: number[];
}

export function dailyActivity(
  rows: ApplicationRow[],
  dayCount: number,
  now: Date = new Date(),
): DailyActivity {
  const days: string[] = [];
  for (let offset = dayCount - 1; offset >= 0; offset -= 1) {
    const day = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - offset,
    );
    days.push(localDayKey(day));
  }
  const index = new Map(days.map((day, i) => [day, i]));
  const empty = () => days.map(() => 0);
  const result: DailyActivity = {
    days,
    started: empty(),
    submitted: empty(),
    interviews: empty(),
    failed: empty(),
    attention: empty(),
  };

  const bump = (series: number[], iso?: string | null) => {
    if (!iso) return;
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return;
    const i = index.get(localDayKey(at));
    if (i !== undefined) series[i] += 1;
  };

  for (const row of rows) {
    bump(result.started, row.createdAt);
    if (row.submittedAt) {
      bump(result.submitted, row.submittedAt);
    } else if (SUBMITTED.has(row.status)) {
      bump(result.submitted, row.completedAt ?? row.updatedAt);
    }
    if (isInterview(row)) bump(result.interviews, row.updatedAt);
    if (FAILED.has(row.status)) {
      bump(result.failed, row.completedAt ?? row.updatedAt);
    }
    if (ATTENTION.has(row.status)) bump(result.attention, row.updatedAt);
  }
  return result;
}

export function sumLast(values: number[], count: number): number {
  return values.slice(-count).reduce((sum, value) => sum + value, 0);
}

export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 45) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
