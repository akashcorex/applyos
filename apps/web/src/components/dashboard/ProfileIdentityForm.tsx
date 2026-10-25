'use client';

import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

import {
  EXPERIENCE_OPTIONS,
  SENIORITY_OPTIONS,
  WORK_MODE_OPTIONS,
  type ProfileIdentityValues,
} from './profile-identity-helpers';
import { FIELD_LABEL, TEXTAREA_CLASS } from './profile-types';
import { ProfileCombobox } from './ProfileCombobox';
import { SURFACE_CARD } from './surfaces';

import type { ProfileIdentityPatch } from './profile-types';

interface ProfileIdentityFormProps {
  values: ProfileIdentityValues;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onChange: (patch: ProfileIdentityPatch) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function ProfileIdentityForm({
  values,
  saving,
  saved,
  error,
  onChange,
  onSave,
  onCancel,
}: ProfileIdentityFormProps) {
  return (
    <section
      aria-label="Edit candidate identity"
      id="profile-identity"
      className={`w-full overflow-hidden ${SURFACE_CARD} scroll-mt-6`}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
          onCancel();
        }}
      >
        {/* ── Header Bar ────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-transparent">
          <div className="flex items-center gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
              Edit Candidate Identity
            </h2>
            <span className="hidden sm:inline text-xs text-zinc-500 font-mono">
              · Update attributes used across autonomous job matching
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-mono text-zinc-400 hover:text-foreground hover:bg-neutral-900"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving}
              className="h-7 text-xs font-mono bg-foreground text-background hover:bg-zinc-200"
            >
              {saved ? 'Saved' : saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="border-b border-red-500/20 bg-red-500/10 px-6 sm:px-8 py-2.5 text-xs font-mono text-red-400">
            {error}
          </div>
        ) : null}

        <div className="divide-y divide-border">
          {/* ── Row 1: Contact & Location ─────────────────────── */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-full-name">
                Full Name
              </label>
              <Input
                id="profile-full-name"
                value={values.name}
                onChange={(e) => onChange({ fullName: e.target.value })}
                placeholder="Your full name"
                className="h-8 text-xs font-sans"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-email">
                Email (read-only)
              </label>
              <Input
                id="profile-email"
                type="email"
                disabled
                value={values.email}
                className="h-8 cursor-not-allowed font-mono text-xs text-zinc-500 bg-neutral-900/50"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-phone">
                Phone
              </label>
              <Input
                id="profile-phone"
                value={values.phone}
                onChange={(e) => onChange({ phone: e.target.value })}
                placeholder="+91 …"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-location">
                Location
              </label>
              <Input
                id="profile-location"
                value={values.location}
                onChange={(e) => onChange({ location: e.target.value })}
                placeholder="City, Country"
                className="h-8 text-xs font-sans"
              />
            </div>
          </div>

          {/* ── Row 2: Target Focus & Seniority ───────────────── */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-headline">
                Target Role
              </label>
              <Input
                id="profile-headline"
                value={values.headline}
                onChange={(e) => onChange({ headline: e.target.value })}
                placeholder="e.g. Senior Full Stack Engineer"
                className="h-8 text-xs font-sans"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-experience">
                Total Experience
              </label>
              <ProfileCombobox
                id="profile-experience"
                value={values.experienceYears}
                items={EXPERIENCE_OPTIONS}
                placeholder="Select years"
                onChange={(next) => onChange({ totalExperienceYears: next })}
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-seniority">
                Seniority Tier
              </label>
              <ProfileCombobox
                id="profile-seniority"
                value={values.seniority}
                items={SENIORITY_OPTIONS}
                placeholder="e.g. senior"
                onChange={(next) => onChange({ seniority: next })}
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-work-mode">
                Work Mode
              </label>
              <ProfileCombobox
                id="profile-work-mode"
                value={values.workMode}
                items={WORK_MODE_OPTIONS}
                placeholder="e.g. remote"
                onChange={(next) => onChange({ workMode: next })}
              />
            </div>
          </div>

          {/* ── Row 3: Professional Summary ───────────────────── */}
          <div className="px-6 sm:px-8 py-4 space-y-1.5">
            <label className={FIELD_LABEL} htmlFor="profile-summary">
              Professional Summary
            </label>
            <textarea
              id="profile-summary"
              className={TEXTAREA_CLASS}
              rows={3}
              value={values.summary}
              onChange={(e) =>
                onChange({ professionalSummary: e.target.value })
              }
              placeholder="A brief executive summary of your strengths and accomplishments"
            />
          </div>

          {/* ── Row 4: Skills & Online Profiles ───────────────── */}
          <div className="w-full grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-skills">
                Skills (comma-separated)
              </label>
              <Input
                id="profile-skills"
                value={values.skills}
                onChange={(e) => onChange({ skills: e.target.value })}
                placeholder="TypeScript, Next.js, PostgreSQL, Docker, AWS"
                className="h-8 text-xs font-mono"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-2">
              <label className={FIELD_LABEL}>Online Profiles</label>
              <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  id="profile-linkedin"
                  type="url"
                  value={values.linkedinUrl}
                  onChange={(e) => onChange({ linkedinUrl: e.target.value })}
                  placeholder="LinkedIn URL"
                  className="h-7 text-xs font-mono"
                />
                <Input
                  id="profile-github"
                  type="url"
                  value={values.githubUrl}
                  onChange={(e) => onChange({ githubUrl: e.target.value })}
                  placeholder="GitHub URL"
                  className="h-7 text-xs font-mono"
                />
                <Input
                  id="profile-portfolio"
                  type="url"
                  value={values.portfolioUrl}
                  onChange={(e) => onChange({ portfolioUrl: e.target.value })}
                  placeholder="Portfolio URL"
                  className="h-7 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* ── Row 5: Application Preferences ────────────────── */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label className={FIELD_LABEL} htmlFor="profile-roles">
                Preferred Roles (comma-separated)
              </label>
              <Input
                id="profile-roles"
                value={values.preferredRoles}
                onChange={(e) => onChange({ preferredRoles: e.target.value })}
                placeholder="Full Stack Engineer, Backend Engineer"
                className="h-8 text-xs font-sans"
              />
            </div>
            <div className="px-6 sm:px-8 py-4 space-y-1.5">
              <label
                className={FIELD_LABEL}
                htmlFor="profile-preferred-locations"
              >
                Preferred Locations (comma-separated)
              </label>
              <Input
                id="profile-preferred-locations"
                value={values.preferredLocations}
                onChange={(e) =>
                  onChange({ preferredLocations: e.target.value })
                }
                placeholder="Remote, Bengaluru, New York"
                className="h-8 text-xs font-sans"
              />
            </div>
          </div>
        </div>

        {/* ── Footer Actions ───────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 sm:px-8 py-3 bg-background">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 text-xs font-mono text-zinc-400 hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="h-8 text-xs font-mono bg-foreground text-background hover:bg-zinc-200"
          >
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </section>
  );
}
