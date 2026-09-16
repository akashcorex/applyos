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
  totalExperienceYears: number | null;
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
  totalExperienceYears,
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
              <select
                id="profile-seniority"
                value={seniority}
                onChange={(event) =>
                  onChange({ seniority: event.target.value })
                }
                className="flex h-9 w-full rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-3 py-2 text-xs font-medium text-slate-900 dark:text-[#f1f3f9]"
              >
                <option value="">Not set</option>
                {['intern', 'junior', 'mid', 'senior', 'staff'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-work-mode">
                Work mode
              </label>
              <select
                id="profile-work-mode"
                value={workMode}
                onChange={(event) => onChange({ workMode: event.target.value })}
                className="flex h-9 w-full rounded-[6px] border border-slate-200 dark:border-[#26282e] bg-slate-50 dark:bg-[#141518] px-3 py-2 text-xs font-medium text-slate-900 dark:text-[#f1f3f9]"
              >
                <option value="">Not set</option>
                {['remote', 'hybrid', 'onsite'].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={FIELD_LABEL} htmlFor="profile-experience">
                Total experience
              </label>
              <Input
                id="profile-experience"
                value={
                  totalExperienceYears === null
                    ? 'Not extracted'
                    : `${totalExperienceYears} years`
                }
                disabled
                className="cursor-not-allowed font-mono text-slate-500"
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
