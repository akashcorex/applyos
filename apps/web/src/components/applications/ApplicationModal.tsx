'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';

import { ApplicationActivityPanel } from '@/components/applications/ApplicationActivityPanel';
import { HumanInterventionBanner } from '@/components/applications/HumanInterventionBanner';
import { LiveBrowserView } from '@/components/applications/LiveBrowserView';
import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import { Button } from '@applyso/ui/button';

interface ApplicationDetail {
  id: string;
  status: string;
  controlMode?: string | null;
  currentUrl?: string | null;
  currentStep?: string | null;
  interventionReason?: string | null;
  humanInterventionRequired?: boolean | null;
  browserSessionId?: string | null;
}

interface ApplicationEvent {
  id: string;
  type: string;
  description: string;
  createdAt?: string;
  created_at?: string;
}

interface HumanIntervention {
  id: string;
  type: string;
  message: string;
  status: string;
}

interface ApplicationModalProps {
  applicationId: string;
  jobTitle?: string;
  companyName?: string;
  onClose: () => void;
}

export function ApplicationModal({
  applicationId,
  jobTitle,
  companyName,
  onClose,
}: ApplicationModalProps) {
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [events, setEvents] = useState<ApplicationEvent[]>([]);
  const [intervention, setIntervention] = useState<HumanIntervention | null>(
    null,
  );
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) {
        setError('Failed to load application');
        return;
      }
      const data = (await res.json()) as {
        application?: ApplicationDetail;
        events?: ApplicationEvent[];
        interventions?: HumanIntervention[];
      };
      setApplication(data.application ?? null);
      setEvents(data.events ?? []);
      setIntervention(
        (data.interventions ?? []).find((item) => item.status === 'open') ??
          null,
      );
      setError(null);
    } catch {
      setError('Application service unavailable');
    }
  }, [applicationId]);

  useEffect(() => {
    void loadDetail();
    const interval = setInterval(() => void loadDetail(), 3000);
    return () => clearInterval(interval);
  }, [loadDetail]);

  const runAction = async (action: string) => {
    setLoadingAction(true);
    try {
      const res = await fetch(
        `/api/applications/${encodeURIComponent(applicationId)}/${action}`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(data.error || `Action ${action} failed`);
        return;
      }
      await loadDetail();
    } finally {
      setLoadingAction(false);
    }
  };

  const title =
    jobTitle && companyName
      ? `${companyName} — ${jobTitle}`
      : jobTitle || companyName || 'Application';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-background shadow-2xl dark:border-[#22242a]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold">{title}</h2>
            {application?.currentStep ? (
              <p className="text-sm text-muted-foreground">
                {application.currentStep}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {application ? (
              <ApplicationStatusBadge status={application.status} />
            ) : null}
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {error ? (
            <p className="mb-3 text-sm text-red-600">{error}</p>
          ) : null}

          {(application?.status === 'waiting_for_human' || intervention) && (
            <div className="mb-4">
              <HumanInterventionBanner
                message={
                  intervention?.message ||
                  application?.interventionReason ||
                  'Human verification required'
                }
                type={intervention?.type}
                loading={loadingAction}
                onResume={() => void runAction('resume')}
                onTakeControl={() => void runAction('take-control')}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <LiveBrowserView
              applicationId={applicationId}
              controlMode={application?.controlMode ?? 'agent_control'}
              browserSessionReady={Boolean(application?.browserSessionId)}
            />
            <ApplicationActivityPanel events={events} />
          </div>

          {application?.currentUrl ? (
            <p className="mt-3 truncate text-xs text-muted-foreground">
              {application.currentUrl}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAction}
              onClick={() => void runAction('take-control')}
            >
              Take Control
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAction}
              onClick={() => void runAction('release-control')}
            >
              Release Control
            </Button>
          </div>
          <div className="flex gap-2">
            {application?.status === 'waiting_for_human' ? (
              <Button
                size="sm"
                disabled={loadingAction}
                onClick={() => void runAction('resume')}
              >
                {loadingAction ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : intervention?.type === 'SUBMIT_APPROVAL' ? (
                  'Approve & Submit'
                ) : (
                  'Continue with AI'
                )}
              </Button>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              disabled={loadingAction}
              onClick={() => void runAction('stop')}
            >
              Stop Application
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
