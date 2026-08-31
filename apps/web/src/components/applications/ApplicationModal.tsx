'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
  metadata?: Record<string, unknown> | null;
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

const DEBUG_STREAM =
  process.env.NEXT_PUBLIC_HITL_DEBUG_STREAM === 'true' ||
  process.env.NEXT_PUBLIC_HITL_DEBUG_STREAM === '1';

function fieldSummaryFromEvents(events: ApplicationEvent[]): string[] {
  const lines: string[] = [];
  for (const event of events) {
    if (event.type === 'FIELD_FILLED' || event.type === 'HUMAN_INTERVENTION') {
      lines.push(event.description);
    }
    const filled = event.metadata?.fields_filled;
    if (typeof filled === 'number' && event.type === 'FIELD_FILLED') {
      lines.push(`Fields filled: ${filled}`);
    }
  }
  return lines.slice(0, 12);
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

  const summaryLines = useMemo(
    () => fieldSummaryFromEvents(events),
    [events],
  );

  const title =
    jobTitle && companyName
      ? `${companyName} — ${jobTitle}`
      : jobTitle || companyName || 'Application';

  const waitingForHuman = application?.status === 'waiting_for_human';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-background shadow-2xl dark:border-[#22242a]">
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

          {(waitingForHuman || intervention) && (
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
                onShowBrowser={() => void runAction('show-browser')}
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 p-4 dark:border-[#22242a]">
                <p className="text-sm font-medium">Shared browser session</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  The agent filled this application in a headed Chrome window on
                  the worker machine. Use <strong>Show browser</strong> to bring
                  that window forward, review or clear blockers there, then
                  approve.
                </p>
                {application?.currentUrl ? (
                  <p className="mt-3 break-all text-xs text-muted-foreground">
                    {application.currentUrl}
                  </p>
                ) : null}
                {summaryLines.length > 0 ? (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {summaryLines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">
                    Activity details appear here as the agent progresses.
                  </p>
                )}
              </div>

              {DEBUG_STREAM ? (
                <LiveBrowserView
                  applicationId={applicationId}
                  controlMode={application?.controlMode ?? 'agent_control'}
                  browserSessionReady={Boolean(application?.browserSessionId)}
                />
              ) : null}
            </div>
            <ApplicationActivityPanel events={events} />
          </div>
        </div>

        <div className="flex items-center justify-between border-t px-4 py-3">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={loadingAction}
              onClick={() => void runAction('show-browser')}
            >
              Show browser
            </Button>
          </div>
          <div className="flex gap-2">
            {waitingForHuman ? (
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
