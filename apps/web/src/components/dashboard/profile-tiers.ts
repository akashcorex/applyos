import type { ProfileTierKey } from '@applyso/validation';

/**
 * Tier visuals — professional identity, not arcade chrome. The ring and badge
 * get richer as the tier rises, but nothing animates permanently; motion is
 * reserved for level-up moments.
 */
export interface TierVisual {
  /** Ring gradient stops [from, to]. */
  ring: [string, string];
  /** Optional mid stop for prismatic tiers. */
  ringMid?: string;
  /** Glow around the ring (box-shadow color). */
  glow?: string;
  /** Badge foreground/background/border classes. */
  badgeClass: string;
  /** XP bar gradient classes. */
  barClass: string;
}

export const TIER_VISUALS: Record<ProfileTierKey, TierVisual> = {
  explorer: {
    ring: ['#64748b', '#94a3b8'],
    badgeClass:
      'bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-500/25',
    barClass: 'from-slate-400 to-slate-500',
  },
  builder: {
    ring: ['#22d3ee', '#3b82f6'],
    badgeClass:
      'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/25',
    barClass: 'from-cyan-400 to-blue-500',
  },
  professional: {
    ring: ['#22d3ee', '#8b5cf6'],
    badgeClass:
      'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/25',
    barClass: 'from-cyan-400 to-violet-500',
  },
  specialist: {
    ring: ['#8b5cf6', '#d946ef'],
    glow: 'rgba(139, 92, 246, 0.35)',
    badgeClass:
      'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25',
    barClass: 'from-violet-400 to-fuchsia-500',
  },
  expert: {
    ring: ['#22d3ee', '#f59e0b'],
    ringMid: '#8b5cf6',
    glow: 'rgba(34, 211, 238, 0.4)',
    badgeClass:
      'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
    barClass: 'from-cyan-400 via-violet-500 to-amber-400',
  },
};

/**
 * Safe tier → visual lookup. Backend keys can drift (new tier, typo,
 * stale cache) — never crash rendering, fall back to explorer.
 */
export function tierVisual(key: string | null | undefined): TierVisual {
  if (!key) return TIER_VISUALS.explorer;
  return TIER_VISUALS[key as ProfileTierKey] ?? TIER_VISUALS.explorer;
}

export interface BannerPreset {
  key: string;
  label: string;
  /** CSS background shorthand applied to the banner surface. */
  background: string;
}

/**
 * Curated banner presets — subtle developer gradients. Custom uploads are
 * deliberately not offered: arbitrary images wreck profile legibility.
 */
export const BANNER_PRESETS: BannerPreset[] = [
  {
    key: 'default',
    label: 'Default',
    background:
      'linear-gradient(120deg, #0e7490 0%, #1d4ed8 55%, #4c1d95 100%)',
  },
  {
    key: 'terminal',
    label: 'Terminal',
    background:
      'repeating-linear-gradient(0deg, rgba(34,211,238,0.06) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, rgba(34,211,238,0.06) 0 1px, transparent 1px 28px), linear-gradient(120deg, #0f172a 0%, #134e4a 100%)',
  },
  {
    key: 'architecture',
    label: 'Architecture',
    background:
      'repeating-linear-gradient(45deg, rgba(148,163,184,0.08) 0 2px, transparent 2px 22px), linear-gradient(120deg, #1e293b 0%, #334155 100%)',
  },
  {
    key: 'ai',
    label: 'AI',
    background:
      'radial-gradient(ellipse 60% 90% at 20% 10%, rgba(139,92,246,0.45) 0%, transparent 60%), radial-gradient(ellipse 50% 80% at 85% 90%, rgba(34,211,238,0.35) 0%, transparent 60%), linear-gradient(120deg, #1e1b4b 0%, #0f172a 100%)',
  },
  {
    key: 'cloud',
    label: 'Cloud',
    background:
      'radial-gradient(ellipse 70% 100% at 50% 0%, rgba(56,189,248,0.4) 0%, transparent 65%), linear-gradient(120deg, #0c4a6e 0%, #1e3a8a 100%)',
  },
  {
    key: 'frontend',
    label: 'Frontend',
    background:
      'linear-gradient(120deg, #831843 0%, #9d174d 45%, #1d4ed8 100%)',
  },
  {
    key: 'backend',
    label: 'Backend',
    background:
      'linear-gradient(120deg, #14532d 0%, #166534 45%, #0f172a 100%)',
  },
  {
    key: 'minimal',
    label: 'Minimal',
    background: 'linear-gradient(120deg, #26282e 0%, #141518 100%)',
  },
];

export const DEFAULT_BANNER_KEY = 'default';

export function bannerPresetByKey(
  key: string | null | undefined,
): BannerPreset {
  return (
    BANNER_PRESETS.find((preset) => preset.key === key) ?? BANNER_PRESETS[0]
  );
}

/** Resolve the avatar <img> src: external OAuth URL, uploaded photo, or null. */
export function avatarSrc(
  image: string | null | undefined,
  cacheBust?: number,
): string | null {
  if (!image) return null;
  if (image.startsWith('http')) return image;
  return `/api/profiles/avatar${cacheBust ? `?v=${cacheBust}` : ''}`;
}
