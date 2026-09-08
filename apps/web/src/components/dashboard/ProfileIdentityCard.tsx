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
          {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
          <Button type="submit" size="sm" disabled={saving}>
            {saved ? 'Saved' : saving ? 'Saving…' : 'Save identity'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
