'use client';

import type { ReactNode } from 'react';

import { isSafeExternalUrl } from './SafeExternalLink';

/**
 * Canonical home for profile-identity display helpers.
 * `capitalize`, `experienceLabel` and the safe-link filter used to live
 * triplicated in ProfileIdentityCard / PublicProfileModal / ProfileHero —
 * import from here instead (see item 7).
 */

export const SENIORITY_OPTIONS = [
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'lead',
];

export const WORK_MODE_OPTIONS = ['remote', 'hybrid', 'onsite'];

export const EXPERIENCE_OPTIONS = [
  { value: '0', label: 'Fresher (0 years)' },
  { value: '1', label: '0–1 years' },
  { value: '2', label: '1–3 years' },
  { value: '4', label: '3–5 years' },
  { value: '7', label: '5–10 years' },
  { value: '12', label: '10–15 years' },
  { value: '15', label: '15+ years' },
];

/** All identity field values are strings at the form/display layer. */
export interface ProfileIdentityValues {
  name: string;
  email: string;
  headline: string;
  location: string;
  phone: string;
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  skills: string;
  preferredRoles: string;
  preferredLocations: string;
  workMode: string;
  seniority: string;
  experienceYears: string;
}

export function splitList(value: string): string[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function capitalize(value: string | null | undefined): string {
  if (!value || !value.trim()) return '—';
  const trimmed = value.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function experienceLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '—';
  const match = EXPERIENCE_OPTIONS.find((o) => o.value === trimmed);
  if (match) return match.label;
  if (/^\d+$/.test(trimmed)) {
    const n = Number.parseInt(trimmed, 10);
    return n === 1 ? '1 year' : `${n} years`;
  }
  return trimmed;
}

/**
 * Numeric variant for DB-backed records (`ProfileRecord.totalExperienceYears`
 * is `number | null`). Kept separate from the form-layer `experienceLabel`
 * (string) on purpose — merging them would conflate two domains.
 */
export function experienceYearsLabel(value?: number | null): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return 'Fresher';
  return `${value} year${value === 1 ? '' : 's'}`;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-[#6b7080]">
      {children}
    </p>
  );
}

export function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 truncate text-[13px] font-medium text-foreground ${mono ? 'font-mono text-xs' : ''}`}
      >
        {value || '—'}
      </p>
    </div>
  );
}

/**
 * Canonical safe-link filter. Replaces the triplicated
 * `.filter(trim !== '' && isSafeExternalUrl)` in ProfileHero,
 * ProfileIdentityRead and PublicProfileModal.
 */
export function getSafeProfileLinks<T extends { value: string }>(
  links: T[],
): T[] {
  return links.filter(
    (link) => link.value.trim() !== '' && isSafeExternalUrl(link.value),
  );
}
