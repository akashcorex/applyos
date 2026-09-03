'use client';

import { useEffect, useState } from 'react';

import { Linkedin } from 'lucide-react';

import { analytics } from '@applyso/analytics';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

import { appCallbackURL, authClient } from '@/lib/auth-client';

interface AutomationSessionStatus {
  has_session: boolean;
  linkedin_authenticated: boolean;
  expires_in_seconds: number | null;
}

interface UserPreferences {
  postApplyLinkedinConnectEnabled: boolean;
  emailOutreachEnabled: boolean;
}

function formatExpiry(seconds: number | null): string | null {
  if (seconds == null || seconds <= 0) {
    return null;
  }
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h`;
}

export function LinkedInConnectCard() {
  const { data: session } = authClient.useSession();
  const [linking, setLinking] = useState(false);
  const [automation, setAutomation] = useState<AutomationSessionStatus | null>(
    null,
  );
  const [automationError, setAutomationError] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    postApplyLinkedinConnectEnabled: false,
    emailOutreachEnabled: false,
  });
  const [savingPreference, setSavingPreference] = useState<
    keyof UserPreferences | null
  >(null);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setAutomation(null);
      return;
    }

    const stableUserId: string = userId;

    async function fetchAutomationSession() {
      try {
        const res = await fetch(
          `/api/linkedin-session?userId=${encodeURIComponent(stableUserId)}`,
        );
        if (!res.ok) {
          setAutomationError(true);
          setAutomation(null);
          return;
        }
        const data = (await res.json()) as AutomationSessionStatus;
        setAutomation(data);
        setAutomationError(false);
      } catch {
        setAutomationError(true);
        setAutomation(null);
      }
    }

    fetchAutomationSession();
    const interval = setInterval(fetchAutomationSession, 30000);
    return () => clearInterval(interval);
  }, [session?.user?.id]);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const res = await fetch('/api/preferences');
        if (!res.ok) return;
        const data = (await res.json()) as Partial<UserPreferences>;
        setPreferences({
          postApplyLinkedinConnectEnabled: Boolean(
            data.postApplyLinkedinConnectEnabled,
          ),
          emailOutreachEnabled: Boolean(data.emailOutreachEnabled),
        });
      } catch {
        // Preferences stay at the safe default (both off).
      }
    }
    void fetchPreferences();
  }, []);

  async function updatePreference(
    key: keyof UserPreferences,
    enabled: boolean,
  ) {
    const next = { ...preferences, [key]: enabled };
    setPreferences(next);
    setSavingPreference(key);
    analytics.track(
      'linkedin_connect_toggled',
      { enabled },
      { feature: 'linkedin_outreach' },
    );
    try {
      await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    } catch {
      setPreferences(preferences);
    } finally {
      setSavingPreference(null);
    }
  }

  async function handleConnect() {
    setLinking(true);
    await authClient.signIn.social({
      provider: 'linkedin',
      callbackURL: appCallbackURL('/dashboard'),
    });
    setLinking(false);
  }

  const automationReady = automation?.linkedin_authenticated === true;
  const expiry = formatExpiry(automation?.expires_in_seconds ?? null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">LinkedIn</CardTitle>
        <div className="flex gap-2">
          <Badge
            variant="outline"
            className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800/40"
          >
            OAuth
          </Badge>
          <Badge
            variant="outline"
            className={
              automationReady
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                : automationError
                  ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
            }
          >
            Automation
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-slate-500 dark:text-[#8a8f9d] mb-2">
            Sign in with LinkedIn for the web app. Post-apply connection
            requests need a separate browser automation session.
          </p>
          <Button
            onClick={handleConnect}
            disabled={linking}
            className="w-full"
            variant="outline"
          >
            <Linkedin className="h-4 w-4" />
            {linking ? 'Connecting...' : 'Connect LinkedIn (OAuth)'}
          </Button>
        </div>

        <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] px-3.5 py-2.5 text-sm">
          <p className="font-medium text-slate-900 dark:text-[#f1f3f9] mb-1">
            Automation session
          </p>
          {automationError ? (
            <p className="text-slate-500 dark:text-[#8a8f9d]">
              Apply agent offline — start apply-agent to check session status.
            </p>
          ) : automationReady ? (
            <p className="text-emerald-600 dark:text-emerald-400 font-medium">
              Active{expiry ? ` · expires in ${expiry}` : ''}. Post-apply
              connects can run.
            </p>
          ) : (
            <>
              <p className="text-amber-600 dark:text-amber-400 mb-2 font-medium">
                Browser login required for auto-connects after job applications.
              </p>
              <p className="text-xs text-slate-500 dark:text-[#8a8f9d] font-mono break-all">
                python apps/apply-agent/scripts/bootstrap_linkedin_session.py
                --user-id {session?.user?.id ?? '<USER_ID>'}
              </p>
            </>
          )}
        </div>

        <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] px-3.5 py-2.5 text-sm space-y-3">
          <p className="font-medium text-slate-900 dark:text-[#f1f3f9]">
            Outreach (opt-in)
          </p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-3.5 w-3.5 rounded-[4px] border-slate-300 dark:border-[#282a32] bg-white dark:bg-[#16171b] text-slate-900 dark:text-[#f1f3f9] focus:ring-slate-900 dark:focus:ring-[#f1f3f9]"
              checked={preferences.postApplyLinkedinConnectEnabled}
              disabled={savingPreference !== null}
              onChange={(event) =>
                void updatePreference(
                  'postApplyLinkedinConnectEnabled',
                  event.target.checked,
                )
              }
            />
            <span>
              <span className="font-medium text-slate-900 dark:text-[#f1f3f9]">
                Post-apply LinkedIn connects
              </span>
              <span className="block text-xs text-slate-500 dark:text-[#8a8f9d]">
                After a successful apply, send blank connection requests to
                people at that company. Off until you enable it.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 h-3.5 w-3.5 rounded-[4px] border-slate-300 dark:border-[#26282e] bg-white dark:bg-[#121213] text-slate-900 dark:text-[#f1f3f9] focus:ring-slate-900 dark:focus:ring-[#f1f3f9]"
              checked={preferences.emailOutreachEnabled}
              disabled={savingPreference !== null}
              onChange={(event) =>
                void updatePreference(
                  'emailOutreachEnabled',
                  event.target.checked,
                )
              }
            />
            <span>
              <span className="font-medium text-slate-900 dark:text-[#f1f3f9]">
                Email follow-ups
              </span>
              <span className="block text-xs text-slate-500 dark:text-[#8a8f9d]">
                Allow the outreach agent to send email through your configured
                provider. Nothing is sent while this is off.
              </span>
            </span>
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
