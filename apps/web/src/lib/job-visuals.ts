import { decisionFromScore } from '@/lib/application-stats';

export type ScoreBand = 'strong' | 'good' | 'moderate' | 'weak' | 'poor';

export const NEW_JOB_DAYS = 7;

export function jobAgeDays(
  iso: string | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!iso) return null;
  const timestamp = new Date(iso).getTime();
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((now - timestamp) / (24 * 3600 * 1000)));
}

export function isNewJob(
  iso: string | null | undefined,
  now: number = Date.now(),
): boolean {
  const age = jobAgeDays(iso, now);
  return age !== null && age <= NEW_JOB_DAYS;
}

export interface JobAccent {
  surface: string;
  avatar: string;
}

export const JOB_ACCENTS: JobAccent[] = [
  {
    surface: 'bg-[#f5f3ff] dark:bg-[#141126]',
    avatar: 'bg-[#e6e1fb] text-[#4c4496] dark:bg-[#251f45] dark:text-[#c7bdf7]',
  },
  {
    surface: 'bg-[#fdf3e3] dark:bg-[#1b1509]',
    avatar: 'bg-[#f9e8c4] text-[#8a6a2b] dark:bg-[#33270f] dark:text-[#e8c98a]',
  },
  {
    surface: 'bg-[#f1f8e8] dark:bg-[#111a0c]',
    avatar: 'bg-[#ddefc9] text-[#4a6b35] dark:bg-[#1e2f12] dark:text-[#b6d999]',
  },
  {
    surface: 'bg-[#edf3ff] dark:bg-[#0e1424]',
    avatar: 'bg-[#d9e6fd] text-[#34548a] dark:bg-[#172440] dark:text-[#a9c4f0]',
  },
  {
    surface: 'bg-[#fef0f0] dark:bg-[#1e1111]',
    avatar: 'bg-[#f9dbdb] text-[#8a3d3d] dark:bg-[#341819] dark:text-[#eba6a6]',
  },
  {
    surface: 'bg-[#fdf8e3] dark:bg-[#1b180a]',
    avatar: 'bg-[#f7ecc2] text-[#7d6526] dark:bg-[#332c11] dark:text-[#e4d191]',
  },
];

export function jobAccent(index: number): JobAccent {
  if (!Number.isFinite(index) || index < 0) return JOB_ACCENTS[0];
  return JOB_ACCENTS[index % JOB_ACCENTS.length];
}

export const BAND_STYLES: Record<ScoreBand, string> = {
  strong: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  good: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  moderate: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  weak: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
  poor: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
};

/**
 * Band for a legacy 0-100 score, capped by the decision it implies. Mirrors
 * `legacyScoreResult` so a stored number cannot out-rank its own decision.
 */
export function bandFromScore(score: number): ScoreBand {
  const decision = decisionFromScore(score);
  const rating = Math.max(1, Math.min(5, score / 20));
  if (decision === 'apply') return rating >= 4.5 ? 'strong' : 'good';
  if (decision === 'maybe') return 'moderate';
  return rating >= 3 ? 'weak' : 'poor';
}

export function formatMatchScore(score: number): string {
  return `${Math.round(score)}% match`;
}

export function cleanDescription(raw?: string | null): string | null {
  if (!raw) return null;
  const text = raw
    .replace(/\r\n/g, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length > 0 ? text : null;
}
