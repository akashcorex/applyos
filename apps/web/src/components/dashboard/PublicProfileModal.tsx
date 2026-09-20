'use client';

import { useEffect } from 'react';

import { ExternalLink, X } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import type { ProfileProgression } from '@applyso/validation';

import {
  capitalize,
  experienceYearsLabel,
  getSafeProfileLinks,
} from './profile-identity-helpers';
import { tierVisual } from './profile-tiers';
import { SafeExternalLink } from './SafeExternalLink';
import { UserAvatar } from './UserAvatar';

import type { ProfileRecord } from './profile-types';

interface PublicProfileModalProps {
  profile: ProfileRecord | null;
  name: string;
  email: string;
  image?: string | null;
  avatarCacheBust?: number;
  progression?: ProfileProgression | null;
  onClose: () => void;
}

export function PublicProfileModal({
  profile,
  name,
  email,
  image,
  avatarCacheBust,
  progression,
  onClose,
}: PublicProfileModalProps) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const skills = profile?.skills ?? [];
  const roles =
    profile?.preferredRoles && profile.preferredRoles.length > 0
      ? profile.preferredRoles
      : profile?.headline?.trim()
        ? [profile.headline.trim()]
        : [];
  const locations =
    profile?.preferredLocations && profile.preferredLocations.length > 0
      ? profile.preferredLocations
      : profile?.location?.trim()
        ? [profile.location.trim()]
        : [];
  const links = getSafeProfileLinks([
    { label: 'LinkedIn', value: profile?.linkedinUrl?.trim() ?? '' },
    { label: 'GitHub', value: profile?.githubUrl?.trim() ?? '' },
    { label: 'Portfolio', value: profile?.portfolioUrl?.trim() ?? '' },
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-background shadow-2xl dark:border-[#22242a]"
        role="dialog"
        aria-modal="true"
        aria-label="Public profile preview"
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Public profile</h2>
            <p className="text-xs text-muted-foreground">
              How employers see you on ApplyOS
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          <div className="flex items-start gap-4">
            <UserAvatar
              name={name}
              email={email}
              image={image}
              size={56}
              cacheBust={avatarCacheBust}
            />
            <div className="min-w-0">
              <p className="text-lg font-semibold tracking-tight truncate">
                {profile?.fullName?.trim() || name || 'Your profile'}
              </p>
              <p className="text-[13px] text-slate-600 dark:text-[#c5c8d2] truncate">
                {profile?.headline?.trim() || 'Add your target role'}
                {profile?.location?.trim() ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · {profile.location.trim()}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {experienceYearsLabel(profile?.totalExperienceYears)}
                {' · '}
                {capitalize(profile?.seniority)}
                {' · '}
                {capitalize(profile?.workMode)}
              </p>
              {progression ? (
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${tierVisual(progression.tier.key).badgeClass}`}
                >
                  <span aria-hidden>◆</span>
                  {progression.tier.label.toUpperCase()}
                  <span className="font-mono font-medium opacity-80">
                    · LEVEL {progression.level}
                  </span>
                </span>
              ) : null}
            </div>
          </div>

          {profile?.professionalSummary?.trim() ? (
            <p className="text-[13px] leading-relaxed text-slate-700 dark:text-[#c5c8d2]">
              {profile.professionalSummary.trim()}
            </p>
          ) : null}

          {skills.length > 0 ? (
            <div>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, i) => (
                  <span
                    key={`${skill}-${i}`}
                    className="inline-flex items-center rounded-[6px] border border-border bg-muted px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-[#c5c8d2]"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            {roles.length > 0 ? (
              <div>
                <p className="text-[11px] text-muted-foreground">Target roles</p>
                <p className="mt-0.5 text-[13px] font-medium">
                  {roles.slice(0, 3).join(' · ')}
                </p>
              </div>
            ) : null}
            {locations.length > 0 ? (
              <div>
                <p className="text-[11px] text-muted-foreground">
                  Preferred locations
                </p>
                <p className="mt-0.5 text-[13px] font-medium">
                  {locations.slice(0, 3).join(' · ')}
                </p>
              </div>
            ) : null}
          </div>

          {links.length > 0 ? (
            <div>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Online presence
              </p>
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <SafeExternalLink
                      href={link.value}
                      className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-cyan-700 dark:text-cyan-400 hover:underline"
                    >
                      <span className="text-muted-foreground font-normal w-16">
                        {link.label}
                      </span>
                      <span className="truncate max-w-[320px] font-mono text-xs">
                        {link.value.replace(/^https?:\/\//, '')}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </SafeExternalLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
