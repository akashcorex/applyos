'use client';

import { useEffect, useState } from 'react';
import { Linkedin } from 'lucide-react';

import { appCallbackURL, authClient } from '@/lib/auth-client';
import { Button } from '@org/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@org/ui/card';
import { Badge } from '@org/ui/badge';

interface AutomationSessionStatus {
  has_session: boolean;
  linkedin_authenticated: boolean;
  expires_in_seconds: number | null;
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

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      setAutomation(null);
      return;
    }

    async function fetchAutomationSession() {
      try {
        const res = await fetch(
          `/api/linkedin-session?userId=${encodeURIComponent(userId)}`,
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
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">
            OAuth
          </Badge>
          <Badge
            variant="outline"
            className={
              automationReady
                ? 'bg-green-100 text-green-800 border-green-300'
                : automationError
                  ? 'bg-gray-100 text-gray-600 border-gray-300'
                  : 'bg-orange-100 text-orange-800 border-orange-300'
            }
          >
            Automation
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground mb-2">
            Sign in with LinkedIn for the web app. Post-apply connection requests
            need a separate browser automation session.
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

        <div className="rounded-md border px-3 py-2 text-sm">
          <p className="font-medium mb-1">Automation session</p>
          {automationError ? (
            <p className="text-muted-foreground">
              Apply agent offline — start apply-agent to check session status.
            </p>
          ) : automationReady ? (
            <p className="text-green-700">
              Active{expiry ? ` · expires in ${expiry}` : ''}. Post-apply
              connects can run.
            </p>
          ) : (
            <>
              <p className="text-orange-700 mb-2">
                Browser login required for auto-connects after job applications.
              </p>
              <p className="text-xs text-muted-foreground font-mono break-all">
                python apps/apply-agent/scripts/bootstrap_linkedin_session.py
                --user-id {session?.user?.id ?? '<USER_ID>'}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
