'use client';

import { useEffect, useRef, useState } from 'react';

import { Camera, ExternalLink, Github, Globe, Linkedin } from 'lucide-react';

import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import type { ProfileProgression } from '@applyso/validation';

import { getSafeProfileLinks } from './profile-identity-helpers';
import {
  BANNER_PRESETS,
  DEFAULT_BANNER_KEY,
  bannerPresetByKey,
  tierVisual,
} from './profile-tiers';
import { ProfileAvatarRing } from './ProfileAvatarRing';
import { SafeExternalLink } from './SafeExternalLink';
import { UserAvatar } from './UserAvatar';

const BANNER_STORAGE_KEY = 'applyos:profile-banner';

interface ProfileHeroProps {
  name: string;
  email: string;
  image?: string | null;
  headline?: string | null;
  location?: string | null;
  workMode?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  progression: ProfileProgression | null;
  /** 0–100 profile completeness — drawn as the avatar ring fill. */
  completionPercent: number | null;
  needsReview: boolean;
  avatarCacheBust?: number;
  onEdit: () => void;
  onViewPublic: () => void;
  onAvatarEdit: () => void;
}

function formatXp(value: number): string {
  return value.toLocaleString('en-US');
}

function useBannerPreset(): [string, (key: string) => void] {
  const [key, setKey] = useState(DEFAULT_BANNER_KEY);
  useEffect(() => {
    const stored = window.localStorage.getItem(BANNER_STORAGE_KEY);
    if (stored && BANNER_PRESETS.some((preset) => preset.key === stored)) {
      setKey(stored);
    }
  }, []);
  const select = (next: string) => {
    setKey(next);
    window.localStorage.setItem(BANNER_STORAGE_KEY, next);
  };
  return [key, select];
}

function BannerPicker({
  onSelect,
}: {
  onSelect: (key: string) => void;
}) {
  return (
    <div className="absolute right-3 top-10 z-20 w-44 rounded-[10px] border border-border bg-popover p-2 shadow-xl">
      <p className="px-1 pb-1.5 text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
        Banner
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {BANNER_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onSelect(preset.key)}
            className="group text-left"
          >
            <span
              className="block h-8 w-full rounded-[6px] border border-black/10 dark:border-white/10 transition-transform group-hover:scale-[1.03]"
              style={{ background: preset.background }}
            />
            <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground group-hover:text-foreground">
              {preset.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileHero({
  name,
  email,
  image,
  headline,
  location,
  workMode,
  linkedinUrl,
  githubUrl,
  portfolioUrl,
  progression,
  completionPercent,
  needsReview,
  avatarCacheBust,
  onEdit,
  onViewPublic,
  onAvatarEdit,
}: ProfileHeroProps) {
  const [bannerKey, setBannerKey] = useBannerPreset();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    function handleClick(event: MouseEvent) {
      if (!pickerRef.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [pickerOpen]);

  const banner = bannerPresetByKey(bannerKey);
  const tier = progression?.tier ?? { key: 'explorer' as const, label: 'Explorer', minLevel: 1 };
  const visual = tierVisual(tier.key);
  const level = progression?.level ?? 1;

  const links = getSafeProfileLinks([
    { label: 'GitHub', value: githubUrl?.trim() ?? '', Icon: Github },
    { label: 'LinkedIn', value: linkedinUrl?.trim() ?? '', Icon: Linkedin },
    { label: 'Portfolio', value: portfolioUrl?.trim() ?? '', Icon: Globe },
  ]);

  return (
    <section
      aria-label="Profile identity"
      className="overflow-hidden rounded-[14px] border border-border bg-card"
    >
      {/* ── Banner ─────────────────────────────────────────── */}
      <div className="relative h-28 sm:h-32" style={{ background: banner.background }}>
        <div ref={pickerRef}>
          <button
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            className="absolute right-3 top-3 rounded-[6px] bg-black/25 px-2 py-1 text-[10px] font-semibold text-white/90 backdrop-blur-sm transition-colors hover:bg-black/40"
          >
            {banner.label}
          </button>
          {pickerOpen ? (
            <BannerPicker
              onSelect={(key) => {
                setBannerKey(key);
                setPickerOpen(false);
              }}
            />
          ) : null}
        </div>
      </div>

      {/* ── Identity ───────────────────────────────────────── */}
      <div className="relative flex flex-col items-center px-5 pb-5 text-center">
        <div className="group relative -mt-10 sm:-mt-12">
          <ProfileAvatarRing
            percent={completionPercent ?? 0}
            tier={tier.key}
            size={88}
            label="Profile completeness"
          >
            <UserAvatar
              name={name}
              email={email}
              image={image}
              size={88}
              cacheBust={avatarCacheBust}
              className="h-full w-full"
            />
          </ProfileAvatarRing>
          <button
            type="button"
            onClick={onAvatarEdit}
            aria-label="Change profile photo"
            className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-all hover:text-foreground md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 md:focus-visible:opacity-100"
          >
            <Camera className="h-3.5 w-3.5" />
          </button>
        </div>
        {completionPercent !== null && completionPercent !== undefined ? (
          <span className="mt-1.5 font-mono text-[11px] font-semibold text-muted-foreground">
            {completionPercent}% complete
          </span>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">
            {name || 'Your profile'}
          </h1>
          {needsReview ? (
            <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20">
              Review needed
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-[13px] text-slate-600 dark:text-[#c5c8d2]">
          {headline?.trim() || 'Add your target role'}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {[location?.trim(), workMode ? `Open to ${workMode}` : '']
            .filter(Boolean)
            .join(' · ') || 'Add your location'}
        </p>

        {/* ── Tier + XP ────────────────────────────────────── */}
        <div className="mt-3 flex flex-col items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${visual.badgeClass}`}
          >
            <span aria-hidden>◆</span>
            {tier.label.toUpperCase()}
            <span className="font-mono font-medium opacity-80">
              · LEVEL {level}
            </span>
          </span>
          {progression ? (
            <div className="w-64">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-semibold text-foreground">
                  {formatXp(progression.xp)} XP
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatXp(progression.intoLevel)} /{' '}
                  {formatXp(progression.levelSpan)}
                </span>
              </div>
              <div
                className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
                aria-valuenow={progression.levelPercent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="XP progress to next level"
              >
                <div
                  className={`h-full rounded-full bg-gradient-to-r transition-all duration-700 ${visual.barClass}`}
                  style={{ width: `${progression.levelPercent}%` }}
                />
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Links ────────────────────────────────────────── */}
        {links.length > 0 ? (
          <div className="mt-3 flex items-center gap-1.5">
            {links.map(({ label, value, Icon }) => (
              <SafeExternalLink
                key={label}
                href={value}
                aria-label={label}
                className="flex h-8 w-8 items-center justify-center rounded-[8px] border border-border text-muted-foreground transition-colors hover:text-foreground hover:border-muted-foreground/40"
              >
                <Icon className="h-4 w-4" />
              </SafeExternalLink>
            ))}
          </div>
        ) : null}

        {/* ── Actions ──────────────────────────────────────── */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="outline" onClick={onViewPublic}>
                              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
            View public profile
          </Button>
          <Button size="sm" onClick={onEdit}>
            Edit profile
          </Button>
        </div>
      </div>
    </section>
  );
}
