'use client';

import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Camera, ExternalLink, Globe } from '@applyso/ui/icons';

import { GithubIcon } from '@/components/icons/GithubIcon';
import { LinkedinIcon } from '@/components/icons/LinkedinIcon';

import { getSafeProfileLinks } from './profile-identity-helpers';
import { ProfileAvatarRing } from './ProfileAvatarRing';
import { SafeExternalLink } from './SafeExternalLink';
import { SURFACE_CARD } from './surfaces';
import { UserAvatar } from './UserAvatar';

interface ProfileHeroProps {
  name: string;
  email: string;
  image?: string | null;
  headline?: string | null;
  location?: string | null;
  workMode?: string | null;
  seniority?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  progression?: unknown;
  completionPercent?: number | null;
  needsReview: boolean;
  avatarCacheBust?: number;
  onEdit: () => void;
  onViewPublic: () => void;
  onAvatarEdit: () => void;
}

export function ProfileHero({
  name,
  email,
  image,
  headline,
  location,
  workMode,
  seniority,
  linkedinUrl,
  githubUrl,
  portfolioUrl,
  completionPercent,
  needsReview,
  avatarCacheBust,
  onEdit,
  onViewPublic,
  onAvatarEdit,
}: ProfileHeroProps) {
  const links = getSafeProfileLinks([
    { label: 'GitHub', value: githubUrl?.trim() ?? '', Icon: GithubIcon },
    { label: 'LinkedIn', value: linkedinUrl?.trim() ?? '', Icon: LinkedinIcon },
    { label: 'Portfolio', value: portfolioUrl?.trim() ?? '', Icon: Globe },
  ]);

  return (
    <section
      aria-label="Profile identity"
      className={`w-full overflow-hidden ${SURFACE_CARD} px-6 py-5 sm:px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-5 min-w-0">
        {/* Avatar with clean hairline ring */}
        <div className="group relative shrink-0">
          <ProfileAvatarRing
            percent={completionPercent ?? 0}
            size={76}
            label="Profile completeness"
          >
            <UserAvatar
              name={name}
              email={email}
              image={image}
              size={76}
              cacheBust={avatarCacheBust}
              className="h-full w-full"
            />
          </ProfileAvatarRing>
          <button
            type="button"
            onClick={onAvatarEdit}
            aria-label="Change profile photo"
            className="pressable fine-hover-scale absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-neutral-900 text-zinc-300 shadow-sm hover:text-foreground"
          >
            <Camera className="h-3 w-3" />
          </button>
        </div>

        {/* User Information */}
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground font-sans">
              {name || 'Candidate Profile'}
            </h1>
            {needsReview ? (
              <Badge className="bg-amber-500/10 text-amber-400 border border-amber-500/25 text-[11px] font-mono font-medium">
                Review needed
              </Badge>
            ) : null}
          </div>

          <p className="text-sm font-medium text-zinc-300">
            {headline?.trim() || 'Add your target role'}
          </p>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {location?.trim() ? (
              <span>{location.trim()}</span>
            ) : (
              <span className="text-zinc-500">Location not set</span>
            )}
            {workMode ? (
              <>
                <span className="text-border">·</span>
                <span className="capitalize">{workMode}</span>
              </>
            ) : null}
            {seniority ? (
              <>
                <span className="text-border">·</span>
                <span className="capitalize">{seniority}</span>
              </>
            ) : null}
          </div>

          {/* Social / Portfolio Links */}
          {links.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              {links.map(({ label, value, Icon }) => (
                <SafeExternalLink
                  key={label}
                  href={value}
                  aria-label={label}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] border border-border bg-neutral-900/40 text-xs font-mono text-zinc-400 hover:text-foreground hover:border-neutral-700 transition-colors"
                >
                  <Icon className="h-3 w-3" />
                  <span>{label}</span>
                </SafeExternalLink>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex shrink-0 items-center gap-2.5 self-start md:self-center">
        <Button
          size="sm"
          variant="outline"
          className="h-8 rounded-[8px] border-border bg-background hover:bg-neutral-900 text-xs font-medium"
          onClick={onViewPublic}
        >
          <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-zinc-400" />
          Public View
        </Button>
        <Button
          size="sm"
          className="h-8 rounded-[8px] bg-foreground text-background hover:bg-zinc-200 text-xs font-medium"
          onClick={onEdit}
        >
          Edit Profile
        </Button>
      </div>
    </section>
  );
}
