'use client';

import { ExternalLink } from 'lucide-react';

import {
  Field,
  SectionLabel,
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
    <div id="profile-identity" className="space-y-8 scroll-mt-6">
      {/* ── Professional profile ─────────────────────────────── */}
      <section aria-label="Professional profile">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Professional profile
          </h2>
          <button
            type="button"
            onClick={onEdit}
            className="text-[11px] font-semibold text-foreground hover:underline"
          >
            Edit
          </button>
        </div>

        <div className="space-y-5">
          <div className="space-y-3">
            <SectionLabel>Personal</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" value={values.name} />
              <Field label="Email" value={values.email} mono />
              <Field label="Phone" value={values.phone} mono />
              <Field label="Location" value={values.location} />
            </div>
          </div>
          <div className="space-y-3">
            <SectionLabel>Professional</SectionLabel>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Target role" value={values.headline} />
              <Field
                label="Experience"
                value={
                  values.experienceYears.trim() === ''
                    ? '—'
                    : experienceLabel(values.experienceYears)
                }
              />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground mb-1">Summary</p>
              <p className="text-[13px] leading-relaxed text-slate-700 dark:text-[#c5c8d2] max-w-[640px]">
                {values.summary.trim() || (
                  <span className="text-muted-foreground">
                    No summary yet — add one so agents can tailor applications.
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Skills + online presence ─────────────────────────── */}
      <section aria-label="Skills and online presence">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Skills</h2>
        </div>

        <div className="space-y-4">
          {skillList.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {skillList.map((skill, i) => (
                <span
                  key={`${skill}-${i}`}
                  className="inline-flex items-center rounded-[6px] border border-border bg-muted px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-[#c5c8d2]"
                >
                  {skill}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">
              No skills yet — add them so matching can rank you correctly.
            </p>
          )}
          <div className="space-y-2">
            <SectionLabel>Online presence</SectionLabel>
            {links.length > 0 ? (
              <ul className="space-y-1.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <SafeExternalLink
                      href={link.value}
                      className="group inline-flex items-center gap-1.5 text-[13px] font-medium text-foreground hover:underline"
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
            ) : (
              <p className="text-[13px] text-muted-foreground">No links yet.</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Job preferences ──────────────────────────────────── */}
      <section aria-label="Job preferences">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">
            Job preferences
          </h2>
        </div>

        <dl className="space-y-2.5 max-w-[640px]">
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-[11px] text-muted-foreground pt-0.5">
              Roles
            </dt>
            <dd className="text-[13px] font-medium">
              {roleList.length > 0 ? roleList.join(' · ') : '—'}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-[11px] text-muted-foreground pt-0.5">
              Locations
            </dt>
            <dd className="text-[13px] font-medium">
              {locationList.length > 0 ? locationList.join(' · ') : '—'}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-[11px] text-muted-foreground pt-0.5">
              Work mode
            </dt>
            <dd className="text-[13px] font-medium">
              {capitalize(values.workMode.trim())}
            </dd>
          </div>
          <div className="flex gap-4">
            <dt className="w-24 shrink-0 text-[11px] text-muted-foreground pt-0.5">
              Seniority
            </dt>
            <dd className="text-[13px] font-medium">
              {capitalize(values.seniority.trim())}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
