import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

import { FIELD_LABEL, TEXTAREA_CLASS } from './profile-types';
import { ProfileCombobox } from './ProfileCombobox';

const SENIORITY_OPTIONS = [
  'intern',
  'junior',
  'mid',
  'senior',
  'staff',
  'lead',
];

const WORK_MODE_OPTIONS = ['remote', 'hybrid', 'onsite'];

const EXPERIENCE_OPTIONS = [
  { value: '0', label: 'Fresher (0 years)' },
  { value: '1', label: '0–1 years' },
  { value: '2', label: '1–3 years' },
  { value: '4', label: '3–5 years' },
  { value: '7', label: '5–10 years' },
  { value: '12', label: '10–15 years' },
  { value: '15', label: '15+ years' },
];

interface ProfileIdentityCardProps {
  name: string;
  email: string;
  headline: string;
  location: string;
  phone: string;
  summary: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  skills: string;
  preferredRoles: string;
  preferredLocations: string;
  workMode: string;
  seniority: string;
  experienceYears: string;
  saving: boolean;
  saved: boolean;
  error: string | null;
  onChange: (patch: Partial<Record<string, string>>) => void;
  onSave: () => void;
}

export function ProfileIdentityCard({
  name,
  email,
  headline,
  location,
  phone,
  summary,
  linkedinUrl,
  githubUrl,
  portfolioUrl,
  skills,
  preferredRoles,
  preferredLocations,
  workMode,
  seniority,
  experienceYears,
  saving,
  saved,
  error,
  onChange,
  onSave,
}: ProfileIdentityCardProps) {
  return (
    <Card id="profile-identity">
      <CardHeader>
        <CardTitle>Professional identity</CardTitle>
        <CardDescription>
          Agents use this on applications. Saving does not confirm extracted
          data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-full-name">
                Full name
              </label>
              <Input
                id="profile-full-name"
                value={name}
                onChange={(event) => onChange({ fullName: event.target.value })}
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
                value={email}
                className="cursor-not-allowed font-mono text-slate-500"
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-headline">
                Target role
              </label>
              <Input
                id="profile-headline"
                value={headline}
                onChange={(event) => onChange({ headline: event.target.value })}
                placeholder="e.g. Senior Backend Engineer"
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-location">
                Location
              </label>
              <Input
                id="profile-location"
                value={location}
                onChange={(event) => onChange({ location: event.target.value })}
                placeholder="e.g. San Francisco / Remote"
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-phone">
                Phone
              </label>
              <Input
                id="profile-phone"
                value={phone}
                onChange={(event) => onChange({ phone: event.target.value })}
                placeholder="+1 555 0100"
              />
            </div>
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="profile-summary">
              Summary
            </label>
            <textarea
              id="profile-summary"
              className={TEXTAREA_CLASS}
              value={summary}
              onChange={(event) =>
                onChange({ professionalSummary: event.target.value })
              }
              placeholder="A short professional summary"
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
                value={linkedinUrl}
                onChange={(event) =>
                  onChange({ linkedinUrl: event.target.value })
                }
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
                value={githubUrl}
                onChange={(event) =>
                  onChange({ githubUrl: event.target.value })
                }
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
                value={portfolioUrl}
                onChange={(event) =>
                  onChange({ portfolioUrl: event.target.value })
                }
                placeholder="https://you.dev"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-skills">
                Skills (comma-separated)
              </label>
              <Input
                id="profile-skills"
                value={skills}
                onChange={(event) => onChange({ skills: event.target.value })}
                placeholder="TypeScript, React, SQL"
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-roles">
                Preferred roles (comma-separated)
              </label>
              <Input
                id="profile-roles"
                value={preferredRoles}
                onChange={(event) =>
                  onChange({ preferredRoles: event.target.value })
                }
                placeholder="Backend Engineer, Platform Engineer"
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
                value={preferredLocations}
                onChange={(event) =>
                  onChange({ preferredLocations: event.target.value })
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
                value={seniority}
                items={SENIORITY_OPTIONS}
                placeholder="e.g. senior — type or pick"
                onChange={(next) => onChange({ seniority: next })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-work-mode">
                Work mode
              </label>
              <ProfileCombobox
                id="profile-work-mode"
                value={workMode}
                items={WORK_MODE_OPTIONS}
                placeholder="e.g. remote — type or pick"
                onChange={(next) => onChange({ workMode: next })}
              />
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-experience">
                Total experience (years)
              </label>
              <ProfileCombobox
                id="profile-experience"
                value={experienceYears}
                items={EXPERIENCE_OPTIONS}
                placeholder="e.g. Fresher or 3–5 years — type or pick"
                onChange={(next) => onChange({ totalExperienceYears: next })}
              />
            </div>
          </div>
          {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
          <Button type="submit" size="sm" disabled={saving}>
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save identity'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
