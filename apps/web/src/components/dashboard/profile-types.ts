import type {
  ProfileActivityKind,
  ProfileCompletion,
  ProfileProgression,
} from '@applyso/validation';

export interface ProfileExperienceItem {
  company: string;
  title: string;
  location?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  description?: string | null;
}

export interface ProfileEducationItem {
  institution: string;
  degree: string;
  fieldOfStudy?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  graduationDate?: string | null;
}

export interface ProfileProjectItem {
  name: string;
  description?: string | null;
  url?: string | null;
}

export interface ProfileRecord {
  fullName?: string | null;
  headline?: string | null;
  phone?: string | null;
  location?: string | null;
  professionalSummary?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  skills?: string[];
  preferredRoles?: string[];
  preferredLocations?: string[];
  workMode?: string | null;
  seniority?: string | null;
  totalExperienceYears?: number | null;
  education?: ProfileEducationItem[];
  experience?: ProfileExperienceItem[];
  projects?: ProfileProjectItem[];
  isConfirmed?: boolean;
}

/**
 * Typed form patch for the identity editor. All values are strings at the
 * form layer (experience is parsed to number|null on save). Replaces the
 * old `Partial<Record<string, string>>` which hid typos like fullName/name.
 */
export interface ProfileIdentityPatch {
  fullName?: string;
  headline?: string;
  location?: string;
  phone?: string;
  professionalSummary?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  skills?: string;
  preferredRoles?: string;
  preferredLocations?: string;
  workMode?: string;
  seniority?: string;
  totalExperienceYears?: string;
}

export interface ProfileLatestResume {
  id: string;
  fileName: string;
  status: string;
  version: number;
  fileSize?: number | null;
  mimeType?: string | null;
  processedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ResumeHistoryItem {
  id: string;
  fileName: string;
  status: string;
  version: number;
  fileSize?: number | null;
  mimeType?: string | null;
  createdAt: string;
  processedAt?: string | null;
  failedAt?: string | null;
  errorMessage?: string | null;
}

export interface ProfileActivityDay {
  date: string;
  count: number;
  kinds: ProfileActivityKind[];
}

export interface ProfileActivityTotals {
  applications: number;
  submitted: number;
  interviews?: number;
  offers?: number;
  activeWorkflows: number;
  jobsDiscovered?: number;
  events: number;
  currentStreak: number;
  longestStreak: number;
}

export interface ProfileTimelineItem {
  at: string;
  kind: ProfileActivityKind;
  label: string;
}

export interface ProfileSummary {
  completion: ProfileCompletion;
  progression?: ProfileProgression;
  resume: ProfileLatestResume | null;
  activity: {
    timeZone: string;
    rangeStart: string;
    rangeEnd: string;
    days: ProfileActivityDay[];
    last30Days?: { date: string; count: number }[];
    timeline?: ProfileTimelineItem[];
    totals: ProfileActivityTotals;
  };
}

export const FIELD_LABEL =
  'block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono';

export const TEXTAREA_CLASS =
  'flex min-h-24 w-full rounded-[8px] border border-border bg-card px-3 py-2 text-xs font-medium text-slate-900 dark:text-[#f1f3f9] shadow-sm transition-all duration-150 placeholder:text-slate-400 dark:placeholder:text-[#8a8f9d]/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-900 dark:focus-visible:ring-[#f1f3f9] focus-visible:border-slate-400 dark:focus-visible:border-[#424654] disabled:cursor-not-allowed disabled:opacity-50';
