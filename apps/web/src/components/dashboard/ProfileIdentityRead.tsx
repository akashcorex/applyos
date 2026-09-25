'use client';

import { Button } from '@applyso/ui/button';
import { ExternalLink } from '@applyso/ui/icons';

import {
  capitalize,
  experienceLabel,
  getSafeProfileLinks,
  splitList,
  type ProfileIdentityValues,
} from './profile-identity-helpers';
import { SafeExternalLink } from './SafeExternalLink';

interface ProfileIdentityReadProps {
  values: ProfileIdentityValues;
  onEdit: () => void;
}

export function ProfileIdentityRead({
  values,
  onEdit,
}: ProfileIdentityReadProps) {
  const skillList = splitList(values.skills);
  const roleList = splitList(values.preferredRoles);
  const locationList = splitList(values.preferredLocations);

  const links = getSafeProfileLinks([
    { label: 'LinkedIn', value: values.linkedinUrl },
    { label: 'GitHub', value: values.githubUrl },
    { label: 'Portfolio', value: values.portfolioUrl },
  ]);

  return (
    <section
      aria-label="Candidate identity"
      id="profile-identity"
      className="w-full border-b border-border bg-background scroll-mt-6"
    >
      {/* ── Section Header ────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Candidate Identity
          </h2>
          <span className="hidden sm:inline text-xs text-zinc-500 font-mono">
            · Attributes used across autonomous job matching
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 text-xs font-mono text-zinc-300 hover:text-foreground hover:bg-neutral-900"
        >
          Edit Details
        </Button>
      </div>

      <div className="divide-y divide-border">
        {/* ── Row 1: Contact & Location (4 columns) ───────────── */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Full Name
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {values.name || '—'}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Email
            </p>
            <p className="mt-1 text-xs font-mono text-zinc-300 truncate">
              {values.email || '—'}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Phone
            </p>
            <p className="mt-1 text-xs font-mono text-zinc-300">
              {values.phone || '—'}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Location
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {values.location || '—'}
            </p>
          </div>
        </div>

        {/* ── Row 2: Target Focus & Seniority (4 columns) ─────── */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Target Role
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {values.headline || '—'}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Total Experience
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {values.experienceYears.trim() === ''
                ? '—'
                : experienceLabel(values.experienceYears)}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Seniority Tier
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {capitalize(values.seniority)}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Work Mode
            </p>
            <p className="mt-1 text-sm font-medium text-foreground">
              {capitalize(values.workMode)}
            </p>
          </div>
        </div>

        {/* ── Row 3: Professional Summary (Full Width) ─────────── */}
        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Professional Summary
          </p>
          <p className="text-xs leading-relaxed text-zinc-300">
            {values.summary.trim() || (
              <span className="text-muted-foreground italic">
                No professional summary entered.
              </span>
            )}
          </p>
        </div>

        {/* ── Row 4: Skills & Online Profiles (2 columns) ─────── */}
        <div className="w-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
          <div className="px-6 sm:px-8 py-4 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Skills ({skillList.length})
            </p>
            {skillList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {skillList.map((skill, i) => (
                  <span
                    key={`${skill}-${i}`}
                    className="inline-flex items-center rounded-[3px] border border-border bg-neutral-900/50 px-2 py-0.5 text-xs font-mono text-zinc-300"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No skills detected.
              </p>
            )}
          </div>

          <div className="px-6 sm:px-8 py-4 space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Online Profiles
            </p>
            {links.length > 0 ? (
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <SafeExternalLink
                      href={link.value}
                      className="group inline-flex items-center gap-2 text-xs font-medium text-foreground hover:text-primary transition-colors"
                    >
                      <span className="text-muted-foreground font-mono text-xs w-16">
                        {link.label}
                      </span>
                      <span className="truncate max-w-[280px] font-mono text-zinc-300 underline underline-offset-2">
                        {link.value.replace(/^https?:\/\//, '')}
                      </span>
                      <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </SafeExternalLink>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                No external profiles linked.
              </p>
            )}
          </div>
        </div>

        {/* ── Row 5: Application Preferences (2 columns) ───────── */}
        <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Target Job Titles
            </p>
            <p className="mt-1 text-xs font-medium text-foreground">
              {roleList.length > 0 ? roleList.join(' · ') : '—'}
            </p>
          </div>
          <div className="px-6 sm:px-8 py-4">
            <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              Target Geographies
            </p>
            <p className="mt-1 text-xs font-medium text-foreground">
              {locationList.length > 0 ? locationList.join(' · ') : '—'}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
