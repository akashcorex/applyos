'use client';

import { useEffect, useState } from 'react';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';
import {
  Bot,
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
  Sliders,
} from '@applyso/ui/icons';

import {
  PageHeader,
  SectionHeader,
  StatStrip,
  StatusPill,
} from '@/components/dashboard/PageChrome';
import { LinkedinIcon } from '@/components/icons/LinkedinIcon';
import { appCallbackURL, authClient } from '@/lib/auth-client';

interface AutomationSessionStatus {
  has_session: boolean;
  linkedin_authenticated: boolean;
  expires_in_seconds: number | null;
}

interface UserPreferences {
  postApplyLinkedinConnectEnabled: boolean;
}

const FIELD_LABEL =
  'block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground';

const STEPS = [
  'The agent submits your application.',
  'It finds people at that company on LinkedIn.',
  'It sends them a connection request from your session.',
];

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
  const [automationLoaded, setAutomationLoaded] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    postApplyLinkedinConnectEnabled: false,
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

    async function fetchAutomationSession() {
      try {
        const res = await fetch('/api/linkedin-session');
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
      } finally {
        setAutomationLoaded(true);
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
        });
      } catch {
        // Preferences stay at the safe default (off).
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
      callbackURL: appCallbackURL('/dashboard/linkedin'),
    });
    setLinking(false);
  }

  const automationReady = automation?.linkedin_authenticated === true;
  const expiry = formatExpiry(automation?.expires_in_seconds ?? null);
  const connectsOn = preferences.postApplyLinkedinConnectEnabled;
  const sessionLabel = automationError
    ? 'Offline'
    : automationReady
      ? 'Active'
      : 'Login needed';

  return (
    <div className="w-full bg-background text-foreground">
      <PageHeader
        title="Outreach"
        description="After the agent applies, it can reach out to people at that company on LinkedIn. Connect your account and choose what runs automatically."
        actions={
          automationError ? (
            <StatusPill tone="neutral">Agent offline</StatusPill>
          ) : automationReady && connectsOn ? (
            <StatusPill tone="success" pulse>
              Outreach active
            </StatusPill>
          ) : (
            <StatusPill tone="warning">Setup needed</StatusPill>
          )
        }
      />

      <StatStrip
        loading={!automationLoaded && Boolean(session?.user?.id)}
        stats={[
          {
            label: 'Automation Session',
            value: sessionLabel,
            icon: Bot,
            subtext: automationError
              ? 'apply agent is not reachable'
              : automationReady
                ? 'browser is signed in to LinkedIn'
                : 'sign in once from the apply agent',
            color: automationReady ? 'green' : 'orange',
          },
          {
            label: 'Session Expires',
            value: expiry ?? '—',
            icon: Clock,
            subtext: expiry ? 'renew before it lapses' : 'no active session',
            color: 'blue',
          },
          {
            label: 'Post-apply Connects',
            value: connectsOn ? 'On' : 'Off',
            icon: Send,
            subtext: connectsOn ? 'runs after each submit' : 'opt in below',
            color: connectsOn ? 'green' : 'red',
          },
        ]}
      />

      <section aria-label="LinkedIn account" className="border-b border-border">
        <SectionHeader
          icon={ShieldCheck}
          title="LinkedIn Account"
          meta="Sign-in and browser session"
        />
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          <div className="space-y-3 bg-background px-6 py-5">
            <p className={FIELD_LABEL}>Sign in with LinkedIn</p>
            <p className="text-xs text-muted-foreground">
              Links LinkedIn to your ApplyOS account so you can sign in with it.
              This does not let the agent send requests.
            </p>
            <Button
              onClick={handleConnect}
              disabled={linking}
              variant="outline"
            >
              <LinkedinIcon className="h-4 w-4" />
              {linking ? 'Connecting…' : 'Connect LinkedIn'}
            </Button>
          </div>

          <div className="space-y-3 bg-background px-6 py-5">
            <div className="flex items-center justify-between gap-2">
              <p className={FIELD_LABEL}>Automation session</p>
              {automationError ? (
                <StatusPill tone="neutral">Offline</StatusPill>
              ) : automationReady ? (
                <StatusPill tone="success">Active</StatusPill>
              ) : (
                <StatusPill tone="warning">Login needed</StatusPill>
              )}
            </div>
            {automationError ? (
              <p className="text-xs text-muted-foreground">
                The apply agent is offline, so we can’t check the session. Start
                the apply agent and this updates within 30 seconds.
              </p>
            ) : automationReady ? (
              <p className="text-xs text-muted-foreground">
                The agent’s browser is signed in to LinkedIn
                {expiry ? ` for another ${expiry}` : ''}. Post-apply connects
                can run.
              </p>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  The agent needs its own signed-in browser to send requests.
                  Run this once from the repo, then log in to LinkedIn in the
                  window that opens:
                </p>
                <pre className="overflow-x-auto rounded-[6px] border border-border bg-muted/30 px-3 py-2 font-mono text-[11px] text-foreground">
                  python apps/apply-agent/scripts/bootstrap_linkedin_session.py
                  --user-id {session?.user?.id ?? '<USER_ID>'}
                </pre>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Outreach rules" className="border-b border-border">
        <SectionHeader
          icon={Sliders}
          title="Outreach Rules"
          meta="Off until you opt in"
        />
        <div className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
          <div className="bg-background px-6 py-5">
            <label className="flex cursor-pointer select-none items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer rounded-[3px] border-border bg-background text-foreground focus:ring-0"
                checked={connectsOn}
                disabled={savingPreference !== null}
                onChange={(event) =>
                  void updatePreference(
                    'postApplyLinkedinConnectEnabled',
                    event.target.checked,
                  )
                }
              />
              <span>
                <span className="text-xs font-semibold text-foreground">
                  Post-apply LinkedIn connects
                </span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  After a successful application, send connection requests to
                  people at that company. Requests go out without a note.
                </span>
                {connectsOn && !automationReady ? (
                  <span className="mt-1.5 block text-[11px] font-medium text-amber-600 dark:text-amber-400">
                    Enabled, but nothing will send until the automation session
                    is active.
                  </span>
                ) : null}
              </span>
            </label>
          </div>

          <div className="space-y-3 bg-background px-6 py-5">
            <p className={FIELD_LABEL}>How it works</p>
            <ol className="space-y-2">
              {STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-2.5 text-xs">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] border border-border font-mono text-[10px] text-muted-foreground">
                    {index + 1}
                  </span>
                  <span className="pt-0.5 text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-500" />
              Each request’s result shows on the run in Job Tracker.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
