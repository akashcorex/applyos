/**
 * ApplyOS progression — XP, levels, tiers and achievements.
 *
 * Design rules (see docs/profile plan):
 * - XP comes only from meaningful, verifiable state (profile data, resumes,
 *   applications, interviews, offers, streaks) — never from clicks.
 * - Progression (level/XP) is derived deterministically from domain state, so
 *   it can never drift out of sync and needs no event-sourcing backend.
 * - Profile *completeness* (computeProfileCompletion) is a separate concept:
 *   how much professional info exists. Level is how far the user has
 *   progressed inside ApplyOS. Do not mix them.
 */
import { hasNonEmptyText } from './profile-summary';

export const PROFILE_TIERS = [
  { key: 'explorer', label: 'Explorer', minLevel: 1 },
  { key: 'builder', label: 'Builder', minLevel: 5 },
  { key: 'professional', label: 'Professional', minLevel: 10 },
  { key: 'specialist', label: 'Specialist', minLevel: 15 },
  { key: 'expert', label: 'Expert', minLevel: 20 },
] as const;

export type ProfileTierKey = (typeof PROFILE_TIERS)[number]['key'];

export interface ProfileTier {
  key: ProfileTierKey;
  label: string;
  minLevel: number;
}

/**
 * XP required to *reach* a level. 25·n·(n+1) − 50 gives the anchor points
 * L1 = 0, L2 = 100, L3 = 250, L4 = 450, L5 = 700 … with gently widening gaps.
 */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return 25 * n * (n + 1) - 50;
}

/** Largest level whose requirement is satisfied by `xp`. */
export function levelForXp(xp: number): number {
  if (!Number.isFinite(xp) || xp < 0) return 1;
  // Invert 25n² + 25n − 50 ≤ xp → n ≤ (−25 + √(625 + 100·(xp + 50))) / 50
  const n = Math.floor((-25 + Math.sqrt(625 + 100 * (xp + 50))) / 50);
  return Math.max(1, n);
}

export function tierForLevel(level: number): ProfileTier {
  let current: ProfileTier = PROFILE_TIERS[0];
  for (const tier of PROFILE_TIERS) {
    if (level >= tier.minLevel) current = tier;
  }
  return current;
}

export interface AchievementDefinition {
  key: string;
  label: string;
  description: string;
  xp: number;
}

/**
 * Achievements are evaluated against real domain state. Each earned
 * achievement contributes its XP to the total — they are the progression
 * backend, not decoration.
 */
export const ACHIEVEMENT_DEFINITIONS = [
  {
    key: 'first-upload',
    label: 'First Upload',
    description: 'Uploaded your first resume',
    xp: 100,
  },
  {
    key: 'identity-complete',
    label: 'Foundations',
    description: 'Completed your core identity — name, role, location, summary',
    xp: 100,
  },
  {
    key: 'preferences-set',
    label: 'Dialed In',
    description: 'Set your job preferences — roles, locations, mode, seniority',
    xp: 100,
  },
  {
    key: 'profile-ready',
    label: 'Profile Ready',
    description: 'Reached 100% profile completion',
    xp: 100,
  },
  {
    key: 'first-application',
    label: 'First Application',
    description: 'Submitted your first application',
    xp: 100,
  },
  {
    key: 'job-hunter',
    label: 'Job Hunter',
    description: 'Applied to 10 jobs',
    xp: 150,
  },
  {
    key: 'interview-ready',
    label: 'Interview Ready',
    description: 'Received your first interview',
    xp: 250,
  },
  {
    key: 'offer-earned',
    label: 'Offer Earned',
    description: 'Received your first offer',
    xp: 500,
  },
  {
    key: 'consistent',
    label: 'Consistent',
    description: 'Stayed active for 7 consecutive days',
    xp: 150,
  },
] as const satisfies readonly AchievementDefinition[];

export type AchievementKey = (typeof ACHIEVEMENT_DEFINITIONS)[number]['key'];

/** Flat XP bonuses for connected accounts (not achievements, just signal). */
export const LINK_XP = 50;

export interface ProgressionInput {
  hasResume: boolean;
  /** fullName + headline + location + professionalSummary all present. */
  identityComplete: boolean;
  /** preferredRoles + preferredLocations + workMode + seniority all present. */
  preferencesComplete: boolean;
  /** Every profile-completion item filled (completion.percent === 100). */
  profileComplete: boolean;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  applications: number;
  interviews: number;
  offers: number;
  longestStreak: number;
}

export interface AchievementState extends AchievementDefinition {
  earned: boolean;
}

export interface ProfileProgression {
  xp: number;
  level: number;
  tier: ProfileTier;
  /** XP accumulated inside the current level. */
  intoLevel: number;
  /** XP span of the current level (next requirement − current requirement). */
  levelSpan: number;
  /** 0–100 progress through the current level. */
  levelPercent: number;
  /** XP required to reach the next level (absolute). */
  nextLevelXp: number;
  achievements: AchievementState[];
  earnedAchievements: number;
}

function achievementEarned(key: AchievementKey, input: ProgressionInput): boolean {
  switch (key) {
    case 'first-upload':
      return input.hasResume;
    case 'identity-complete':
      return input.identityComplete;
    case 'preferences-set':
      return input.preferencesComplete;
    case 'profile-ready':
      return input.profileComplete;
    case 'first-application':
      return input.applications >= 1;
    case 'job-hunter':
      return input.applications >= 10;
    case 'interview-ready':
      return input.interviews >= 1;
    case 'offer-earned':
      return input.offers >= 1;
    case 'consistent':
      return input.longestStreak >= 7;
    default:
      return false;
  }
}

function hasText(value: string | null | undefined): boolean {
  return hasNonEmptyText(value);
}

export function computeProgression(input: ProgressionInput): ProfileProgression {
  const achievements: AchievementState[] = ACHIEVEMENT_DEFINITIONS.map(
    (definition) => ({
      ...definition,
      earned: achievementEarned(definition.key, input),
    }),
  );

  let xp = 0;
  for (const achievement of achievements) {
    if (achievement.earned) xp += achievement.xp;
  }
  if (hasText(input.linkedinUrl)) xp += LINK_XP;
  if (hasText(input.githubUrl)) xp += LINK_XP;
  if (hasText(input.portfolioUrl)) xp += LINK_XP;

  const level = levelForXp(xp);
  const currentLevelXp = xpForLevel(level);
  const nextLevelXp = xpForLevel(level + 1);
  const levelSpan = nextLevelXp - currentLevelXp;
  const intoLevel = xp - currentLevelXp;
  const levelPercent = Math.min(
    100,
    Math.max(0, Math.floor((intoLevel / levelSpan) * 100)),
  );

  return {
    xp,
    level,
    tier: tierForLevel(level),
    intoLevel,
    levelSpan,
    levelPercent,
    nextLevelXp,
    achievements,
    earnedAchievements: achievements.filter((a) => a.earned).length,
  };
}
