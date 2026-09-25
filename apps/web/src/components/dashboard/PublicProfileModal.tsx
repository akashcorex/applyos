'use client';

import { useEffect } from 'react';

import { Button } from '@applyso/ui/button';
import { ExternalLink, X } from '@applyso/ui/icons';

import {
  capitalize,
  experienceYearsLabel,
  getSafeProfileLinks,
} from './profile-identity-helpers';
import { SafeExternalLink } from './SafeExternalLink';
import { UserAvatar } from './UserAvatar';

import type { ProfileRecord } from './profile-types';

interface PublicProfileModalProps {
  profile: ProfileRecord | null;
  name: string;
  email: string;
  image?: string | null;
  avatarCacheBust?: number;
  progression?: unknown;
  onClose: () => void;
}

export function PublicProfileModal({
  profile,
  name,
  email,
  image,
  avatarCacheBust,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className="modal-pop flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[8px] border border-border bg-background shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Public profile preview"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-background">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Public profile preview
            </h2>
            <p className="text-xs text-muted-foreground">
              Candidate identity visible to verified employers on ApplyOS
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-[6px] hover:bg-neutral-900/50 text-muted-foreground hover:text-foreground"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex items-start gap-4">
            <UserAvatar
              name={name}
              email={email}
              image={image}
              size={56}
              cacheBust={avatarCacheBust}
            />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold tracking-tight text-foreground truncate">
                {profile?.fullName?.trim() || name || 'Your profile'}
              </p>
              <p className="text-[13px] text-zinc-400 truncate">
                {profile?.headline?.trim() || 'Target Role Not Specified'}
                {profile?.location?.trim() ? (
                  <span className="text-muted-foreground">
                    {' '}
                    · {profile.location.trim()}
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                {experienceYearsLabel(profile?.totalExperienceYears)}
                {' · '}
                {capitalize(profile?.seniority) || 'Mid-Senior'}
                {' · '}
                {capitalize(profile?.workMode) || 'Flexible'}
              </p>
            </div>
          </div>

          {profile?.professionalSummary?.trim() ? (
            <div className="rounded-[6px] border border-border/80 bg-neutral-900/20 p-3.5">
              <p className="text-xs font-mono font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
                Executive Summary
              </p>
              <p className="text-[13px] leading-relaxed text-zinc-300">
                {profile.professionalSummary.trim()}
              </p>
            </div>
          ) : null}

          {skills.length > 0 ? (
            <div>
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Verified Skills
              </p>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((skill, i) => (
                  <span
                    key={`${skill}-${i}`}
                    className="inline-flex items-center rounded-[4px] border border-border bg-neutral-900/40 px-2 py-0.5 text-xs font-mono text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border">
            {roles.length > 0 ? (
              <div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Target roles
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-foreground">
                  {roles.slice(0, 3).join(' · ')}
                </p>
              </div>
            ) : null}
            {locations.length > 0 ? (
              <div>
                <p className="text-[11px] font-mono text-muted-foreground">
                  Preferred locations
                </p>
                <p className="mt-0.5 text-[13px] font-medium text-foreground">
                  {locations.slice(0, 3).join(' · ')}
                </p>
              </div>
            ) : null}
          </div>

          {links.length > 0 ? (
            <div className="pt-2 border-t border-border">
              <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">
                Online presence
              </p>
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <SafeExternalLink
                      href={link.value}
                      className="group inline-flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
                    >
                      <span className="text-muted-foreground w-16 font-normal">
                        {link.label}
                      </span>
                      <span className="truncate max-w-[320px] font-mono text-zinc-300 underline underline-offset-2">
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
