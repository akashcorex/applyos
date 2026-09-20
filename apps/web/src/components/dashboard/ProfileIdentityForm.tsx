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
    <div id="profile-identity" className="space-y-8 scroll-mt-6">
      <form
        className="space-y-8"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
          // Close after a tick so `saved` feedback is visible in read mode too.
          // The parent re-fetches and updates values; keep edit closed optimistically.
          onCancel();
        }}
      >
        {/* ── Professional profile ─────────────────────────── */}
        <section aria-label="Professional profile">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Professional profile
            </h2>
          </div>
          <div className="space-y-4 rounded-[12px] border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-full-name">
                  Full name
                </label>
                <Input
                  id="profile-full-name"
                  value={values.name}
                  onChange={(e) => onChange({ fullName: e.target.value })}
                  placeholder="Your name"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-email">
                  Email
                </label>
                <Input
                  id="profile-email"
                  type="email"
                  disabled
                  value={values.email}
                  className="cursor-not-allowed font-mono text-slate-500"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-headline">
                  Target role
                </label>
                <Input
                  id="profile-headline"
                  value={values.headline}
                  onChange={(e) => onChange({ headline: e.target.value })}
                  placeholder="e.g. Full Stack Software Engineer"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-location">
                  Location
                </label>
                <Input
                  id="profile-location"
                  value={values.location}
                  onChange={(e) => onChange({ location: e.target.value })}
                  placeholder="e.g. Durgapur / Remote"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-phone">
                  Phone
                </label>
                <Input
                  id="profile-phone"
                  value={values.phone}
                  onChange={(e) => onChange({ phone: e.target.value })}
                  placeholder="+91 …"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-experience">
                  Total experience (years)
                </label>
                <ProfileCombobox
                  id="profile-experience"
                  value={values.experienceYears}
                  items={EXPERIENCE_OPTIONS}
                  placeholder="e.g. Fresher or 3–5 years"
                  onChange={(next) => onChange({ totalExperienceYears: next })}
                />
              </div>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-summary">
                Professional summary
              </label>
              <textarea
                id="profile-summary"
                className={TEXTAREA_CLASS}
                value={values.summary}
                onChange={(e) =>
                  onChange({ professionalSummary: e.target.value })
                }
                placeholder="A short professional summary"
              />
            </div>
          </div>
        </section>

        {/* ── Skills + online presence ───────────────────────── */}
        <section aria-label="Skills and online presence">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">Skills</h2>
          </div>
          <div className="space-y-4 rounded-[12px] border border-border bg-card p-4">
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-skills">
                Skills (comma-separated)
              </label>
              <Input
                id="profile-skills"
                value={values.skills}
                onChange={(e) => onChange({ skills: e.target.value })}
                placeholder="React, TypeScript, Node.js"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-linkedin">
                  LinkedIn
                </label>
                <Input
                  id="profile-linkedin"
                  type="url"
                  value={values.linkedinUrl}
                  onChange={(e) => onChange({ linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/you"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-github">
                  GitHub
                </label>
                <Input
                  id="profile-github"
                  type="url"
                  value={values.githubUrl}
                  onChange={(e) => onChange({ githubUrl: e.target.value })}
                  placeholder="https://github.com/you"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-portfolio">
                  Portfolio
                </label>
                <Input
                  id="profile-portfolio"
                  type="url"
                  value={values.portfolioUrl}
                  onChange={(e) => onChange({ portfolioUrl: e.target.value })}
                  placeholder="https://you.dev"
                />
              </div>
            </div>
          </div>
        </section>

        {/* ── Job preferences ────────────────────────────────── */}
        <section aria-label="Job preferences">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">
              Job preferences
            </h2>
          </div>
          <div className="space-y-4 rounded-[12px] border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-roles">
                  Preferred roles (comma-separated)
                </label>
                <Input
                  id="profile-roles"
                  value={values.preferredRoles}
                  onChange={(e) => onChange({ preferredRoles: e.target.value })}
                  placeholder="Full Stack Engineer, Backend Engineer"
                />
              </div>
              <div>
                <label
                  className={FIELD_LABEL}
                  htmlFor="profile-preferred-locations"
                >
                  Preferred locations (comma-separated)
                </label>
                <Input
                  id="profile-preferred-locations"
                  value={values.preferredLocations}
                  onChange={(e) =>
                    onChange({ preferredLocations: e.target.value })
                  }
                  placeholder="Remote, Bengaluru"
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-seniority">
                  Seniority
                </label>
                <ProfileCombobox
                  id="profile-seniority"
                  value={values.seniority}
                  items={SENIORITY_OPTIONS}
                  placeholder="e.g. junior — type or pick"
                  onChange={(next) => onChange({ seniority: next })}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="profile-work-mode">
                  Work mode
                </label>
                <ProfileCombobox
                  id="profile-work-mode"
                  value={values.workMode}
                  items={WORK_MODE_OPTIONS}
                  placeholder="e.g. remote — type or pick"
                  onChange={(next) => onChange({ workMode: next })}
                />
              </div>
            </div>
          </div>
        </section>

        {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving}>
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
