'use client';

import { useEffect, useRef, useState } from 'react';

import Link from 'next/link';

import { analytics } from '@applyso/analytics';
import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Layers,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Square,
  Workflow,
} from '@applyso/ui/icons';

import { ApplicationModal } from '@/components/applications/ApplicationModal';
import { ApplicationStatusBadge } from '@/components/applications/ApplicationStatusBadge';
import {
  EmptyState,
  PageHeader,
  SectionHeader,
  StatStrip,
  StatusPill,
  type Tone,
} from '@/components/dashboard/PageChrome';

type WorkflowStatus =
  | 'pending'
  | 'discovering_funding'
  | 'discovering'
  | 'deciding'
  | 'filtering'
  | 'applying'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'paused'
  | 'stopped'
  | 'cancelled';

interface WorkflowSummary {
  id: string;
  status: WorkflowStatus;
  job_count: number;
  apply_total: number;
  apply_completed: number;
  apply_successful: number;
  error_count: number;
  created_at: string;
  updated_at: string;
}

interface DiscoveredJob {
  external_id: string;
  source: string;
  title: string;
  company_name: string;
  department: string | null;
  location: string | null;
  location_type: string | null;
  seniority: string | null;
  filter_score: number;
}

interface ApplyTask {
  job_id: string;
  job_title: string;
  company_name: string;
  application_url: string;
  application_id?: string | null;
  task_id: string | null;
  status: string;
  error_detail: string | null;
  page_url?: string | null;
  screenshot_path?: string | null;
  linkedin_connect_status: string | null;
  outcome?: string | null;
}

interface WorkflowDetail {
  id: string;
  status: WorkflowStatus;
  discovered_jobs: DiscoveredJob[];
  apply_tasks: ApplyTask[];
  errors: string[];
  created_at: string;
  updated_at: string;
}

interface WorkflowEvent {
  id?: string;
  eventType?: string;
  event_type?: string;
  payload?: unknown;
  occurredAt?: string;
  occurred_at?: string;
  createdAt?: string;
  created_at?: string;
}

type LifecycleAction = 'pause' | 'resume' | 'stop';

const STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; tone: Tone; title?: string; pulse?: boolean }
> = {
  pending: { label: 'Pending', tone: 'neutral' },
  discovering_funding: { label: 'Funding', tone: 'info', pulse: true },
  discovering: { label: 'Discovering', tone: 'info', pulse: true },
  deciding: { label: 'Deciding', tone: 'info', pulse: true },
  filtering: { label: 'Filtering', tone: 'info', pulse: true },
  applying: { label: 'Applying', tone: 'info', pulse: true },
  completed: { label: 'Completed', tone: 'success' },
  partial: {
    label: 'Partial',
    tone: 'warning',
    title: 'Some apply tasks finished, but not all succeeded',
  },
  failed: { label: 'Failed', tone: 'danger' },
  paused: { label: 'Paused', tone: 'warning' },
  stopped: { label: 'Stopped', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

const FIELD_LABEL =
  'text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground';

function runLabel(dateStr: string): string {
  return new Date(dateStr).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function eventTimestamp(event: WorkflowEvent): string | null {
  const timestamp =
    event.occurredAt ??
    event.occurred_at ??
    event.createdAt ??
    event.created_at;
  return typeof timestamp === 'string' && Number.isFinite(Date.parse(timestamp))
    ? timestamp
    : null;
}

function eventKey(event: WorkflowEvent): string {
  return (
    event.id ??
    `${event.eventType ?? event.event_type ?? 'workflow'}:${eventTimestamp(event) ?? ''}:${JSON.stringify(event.payload ?? null)}`
  );
}

function eventLabel(event: WorkflowEvent): string {
  return (event.eventType ?? event.event_type ?? 'workflow.event')
    .replaceAll('_', ' ')
    .replaceAll('.', ' · ');
}

function eventDetail(event: WorkflowEvent): string | null {
  if (typeof event.payload === 'string') return event.payload;
  if (!event.payload || typeof event.payload !== 'object') return null;

  const payload = event.payload as Record<string, unknown>;
  const jobTitle =
    typeof payload.jobTitle === 'string' ? payload.jobTitle : null;
  const companyName =
    typeof payload.companyName === 'string' ? payload.companyName : null;
  const jobLabel =
    companyName && jobTitle
      ? `${companyName} — ${jobTitle}`
      : companyName || jobTitle;

  const applications = Array.isArray(payload.applications)
    ? payload.applications
    : null;
  const application = applications?.find(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object',
  );
  const applicationJobTitle =
    application && typeof application.jobTitle === 'string'
      ? application.jobTitle
      : null;
  const applicationCompanyName =
    application && typeof application.companyName === 'string'
      ? application.companyName
      : null;
  const applicationLabel =
    applicationCompanyName && applicationJobTitle
      ? `${applicationCompanyName} — ${applicationJobTitle}`
      : applicationCompanyName || applicationJobTitle;

  const status = typeof payload.status === 'string' ? payload.status : null;
  const applicationStatus =
    application && typeof application.status === 'string'
      ? application.status
      : null;

  for (const value of [
    payload.errorDetail,
    payload.error_detail,
    payload.error,
  ]) {
    if (typeof value === 'string') {
      const label = jobLabel || applicationLabel;
      return label ? `${label}: ${value}` : value;
    }
  }

  const resolvedStatus = applicationStatus || status;
  if (resolvedStatus) {
    const label = jobLabel || applicationLabel;
    return label ? `${label}: ${resolvedStatus}` : resolvedStatus;
  }

  return jobLabel || applicationLabel;
}

function applyTaskLabel(task: ApplyTask): string {
  if (task.company_name && task.job_title) {
    return `${task.company_name} — ${task.job_title}`;
  }
  return task.job_title || task.company_name || 'Unknown job';
}

function isTerminalStatus(status: WorkflowStatus): boolean {
  return ['completed', 'partial', 'failed', 'stopped', 'cancelled'].includes(
    status,
  );
}

function effectiveWorkflowStatus(
  wf: WorkflowSummary,
  detail?: WorkflowDetail | null,
): WorkflowStatus {
  if (detail && detail.id === wf.id && isTerminalStatus(detail.status)) {
    return detail.status;
  }
  if (wf.apply_total > 0 && wf.apply_successful === wf.apply_total) {
    return 'completed';
  }
  if (
    wf.apply_total > 0 &&
    wf.apply_completed === wf.apply_total &&
    wf.apply_successful > 0
  ) {
    return 'partial';
  }
  if (
    wf.apply_total > 0 &&
    wf.apply_completed === wf.apply_total &&
    wf.apply_successful === 0
  ) {
    return 'partial';
  }
  return detail?.id === wf.id ? detail.status : wf.status;
}

export function WorkflowPanel({
  focusWorkflowId,
  refreshKey = 0,
}: {
  focusWorkflowId?: string | null;
  refreshKey?: number;
}) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const eventsRef = useRef<WorkflowEvent[]>([]);
  const [lifecycleAction, setLifecycleAction] =
    useState<LifecycleAction | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(
    null,
  );
  const [openApplicationMeta, setOpenApplicationMeta] = useState<{
    jobTitle?: string;
    companyName?: string;
  }>({});

  function appendEvents(incoming: WorkflowEvent[]) {
    setEvents((current) => {
      const byKey = new Map(current.map((event) => [eventKey(event), event]));
      for (const event of incoming) byKey.set(eventKey(event), event);
      const next = Array.from(byKey.values())
        .sort((a, b) => {
          const aTime = eventTimestamp(a) ?? '';
          const bTime = eventTimestamp(b) ?? '';
          return aTime.localeCompare(bTime);
        })
        .slice(-100);
      eventsRef.current = next;
      return next;
    });
  }

  async function fetchWorkflows() {
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      const nextWorkflows = (data.workflows ?? []) as WorkflowSummary[];
      setWorkflows(nextWorkflows);
      if (expandedId) {
        const summary = nextWorkflows.find((wf) => wf.id === expandedId);
        if (summary && detail && summary.status !== detail.status) {
          void refreshWorkflowDetail(expandedId);
        }
      }
    } catch {
      // orchestrator not running
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkflowDetail(id: string) {
    setExpandedId(id);
    setDetailLoading(true);
    setDetail(null);
    await refreshWorkflowDetail(id, { showLoading: true });
  }

  async function refreshWorkflowDetail(
    id: string,
    options: { showLoading?: boolean } = {},
  ) {
    if (options.showLoading) {
      setDetailLoading(true);
    }
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) {
        if (options.showLoading) setDetail(null);
        return;
      }
      const data = (await res.json()) as WorkflowDetail;
      setDetail(data);
    } catch {
      if (options.showLoading) setDetail(null);
    } finally {
      if (options.showLoading) {
        setDetailLoading(false);
      }
    }
  }

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  useEffect(() => {
    if (!focusWorkflowId) {
      return;
    }
    void loadWorkflowDetail(focusWorkflowId);
  }, [focusWorkflowId]);

  useEffect(() => {
    if (!expandedId || !detail || isTerminalStatus(detail.status)) {
      return;
    }
    const interval = setInterval(() => {
      void refreshWorkflowDetail(expandedId);
    }, 3000);
    return () => clearInterval(interval);
  }, [expandedId, detail?.status]);

  useEffect(() => {
    if (!expandedId) {
      eventsRef.current = [];
      setEvents([]);
      return;
    }

    eventsRef.current = [];
    setEvents([]);
    let cancelled = false;
    let fallbackTimer: ReturnType<typeof setInterval> | undefined;
    let eventSource: EventSource | undefined;

    const eventUrl = (once: boolean) => {
      const url = new URL(
        `/api/workflows/${expandedId}/events`,
        window.location.origin,
      );
      if (once) url.searchParams.set('once', '1');
      const latestEvent = eventsRef.current.at(-1);
      const after = latestEvent ? eventTimestamp(latestEvent) : null;
      if (after) url.searchParams.set('after', after);
      return url.toString();
    };

    const pollEvents = async () => {
      try {
        const res = await fetch(eventUrl(true));
        if (!res.ok) return;
        const data = (await res.json()) as { events?: WorkflowEvent[] };
        if (!cancelled && Array.isArray(data.events)) appendEvents(data.events);
      } catch {
        // Workflow summary polling remains available while event polling retries.
      }
    };

    const startFallbackPolling = () => {
      if (fallbackTimer || cancelled) return;
      void pollEvents();
      fallbackTimer = setInterval(() => void pollEvents(), 5000);
    };

    if (typeof EventSource === 'undefined') {
      startFallbackPolling();
    } else {
      eventSource = new EventSource(eventUrl(false));
      eventSource.addEventListener('workflow', (message) => {
        try {
          const event = JSON.parse(
            (message as MessageEvent<string>).data,
          ) as WorkflowEvent;
          if (!cancelled) appendEvents([event]);
        } catch {
          // Ignore malformed event data and keep the stream open for later events.
        }
      });
      eventSource.addEventListener('workflow-error', startFallbackPolling);
      eventSource.onerror = () => {
        eventSource?.close();
        startFallbackPolling();
      };
    }

    return () => {
      cancelled = true;
      eventSource?.close();
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [expandedId]);

  async function handleLifecycle(id: string, action: LifecycleAction) {
    setLifecycleAction(action);
    setLifecycleError(null);
    try {
      const res = await fetch(`/api/workflows/${id}/${action}`, {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setLifecycleError(data.error ?? `Unable to ${action} workflow`);
        return;
      }
      if (action === 'pause') {
        analytics.track(
          'workflow_paused',
          { current_step: detail?.status },
          { feature: 'workflows' },
        );
      } else if (action === 'resume') {
        analytics.track(
          'workflow_resumed',
          { current_step: detail?.status },
          { feature: 'workflows' },
        );
      } else if (action === 'stop') {
        analytics.track(
          'workflow_cancelled',
          {
            completed_count:
              detail?.apply_tasks?.filter((t) => t.status === 'submitted')
                .length ?? 0,
            total_count: detail?.apply_tasks?.length ?? 0,
          },
          { feature: 'workflows' },
        );
      }
      await Promise.all([fetchWorkflows(), refreshWorkflowDetail(id)]);
    } catch {
      setLifecycleError(`Unable to ${action} workflow`);
    } finally {
      setLifecycleAction(null);
    }
  }

  async function handleToggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    await loadWorkflowDetail(id);
  }

  const activeRuns = workflows.filter(
    (wf) => !isTerminalStatus(effectiveWorkflowStatus(wf)),
  ).length;
  const jobsTotal = workflows.reduce((sum, wf) => sum + wf.job_count, 0);
  const submittedTotal = workflows.reduce(
    (sum, wf) => sum + wf.apply_successful,
    0,
  );
  const attemptedTotal = workflows.reduce(
    (sum, wf) => sum + wf.apply_completed,
    0,
  );
  const failedTotal = Math.max(0, attemptedTotal - submittedTotal);
  const successRate =
    attemptedTotal > 0
      ? Math.round((submittedTotal / attemptedTotal) * 100)
      : null;

  return (
    <div className="w-full bg-background text-foreground">
      <PageHeader
        title="Job Tracker"
        description="Every agent run, step by step. Pause or stop a run, inspect what happened, and record the outcome of each application."
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoading(true);
              void fetchWorkflows();
            }}
          >
            <RefreshCw className={loading ? 'animate-spin' : ''} />
            Refresh
          </Button>
        }
      />

      <StatStrip
        loading={loading && workflows.length === 0}
        stats={[
          {
            label: 'Runs',
            value: String(workflows.length),
            icon: Layers,
            subtext: `${jobsTotal} jobs queued`,
            color: 'blue',
          },
          {
            label: 'Active',
            value: String(activeRuns),
            icon: Loader2,
            subtext: activeRuns > 0 ? 'running now' : 'nothing running',
            color: 'orange',
          },
          {
            label: 'Submitted',
            value: String(submittedTotal),
            icon: CheckCircle2,
            delta: successRate === null ? undefined : `${successRate}%`,
            deltaTone: successRate ? 'positive' : 'neutral',
            subtext: successRate === null ? 'no attempts yet' : 'success rate',
            color: 'green',
          },
          {
            label: 'Failed',
            value: String(failedTotal),
            icon: AlertTriangle,
            subtext: 'captcha, login or errors',
            color: 'red',
          },
        ]}
      />

      <section aria-label="Runs" className="border-b border-border">
        <SectionHeader
          icon={Workflow}
          title="Runs"
          meta={workflows.length > 0 ? `${workflows.length} recent` : undefined}
        />
        {loading && workflows.length === 0 ? (
          <div className="divide-y divide-border/60" aria-label="Loading runs">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex animate-pulse items-center gap-3 px-6 py-3.5"
              >
                <div className="h-3 w-3 rounded bg-muted" />
                <div className="h-3 w-40 rounded bg-muted" />
                <div className="ml-auto h-3 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : workflows.length > 0 ? (
          <div className="divide-y divide-border/60">
            {workflows.map((wf) => {
              const detailStatus = effectiveWorkflowStatus(
                wf,
                expandedId === wf.id ? detail : null,
              );
              const cfg = STATUS_CONFIG[detailStatus] ?? STATUS_CONFIG.pending;
              return (
                <div key={wf.id}>
                  <button
                    type="button"
                    onClick={() => handleToggle(wf.id)}
                    aria-expanded={expandedId === wf.id}
                    className={`flex w-full items-center justify-between gap-3 px-6 py-3 text-left text-xs transition-colors hover:bg-muted/25 ${
                      expandedId === wf.id ? 'bg-muted/20' : ''
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      {expandedId === wf.id ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-medium text-foreground">
                        Run · {runLabel(wf.created_at)}
                      </span>
                      <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                        {shortId(wf.id)}
                      </span>
                      <StatusPill
                        tone={cfg.tone}
                        title={cfg.title}
                        pulse={cfg.pulse}
                      >
                        {cfg.label}
                      </StatusPill>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 font-mono text-[11px] text-muted-foreground">
                      {wf.job_count > 0 && (
                        <span className="hidden sm:inline">
                          {wf.job_count} jobs
                        </span>
                      )}
                      {wf.apply_total > 0 && (
                        <span
                          className={
                            wf.apply_successful < wf.apply_total
                              ? 'text-red-500 dark:text-red-400'
                              : 'text-emerald-500 dark:text-emerald-400'
                          }
                        >
                          {wf.apply_successful}/{wf.apply_total} applied
                        </span>
                      )}
                      <span className="flex items-center gap-1 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {timeAgo(wf.created_at)}
                      </span>
                    </div>
                  </button>

                  {expandedId === wf.id && (
                    <div className="border-t border-border/60 bg-muted/10">
                      {detailLoading && (
                        <p className="flex items-center gap-2 px-6 py-4 text-xs text-muted-foreground">
                          <Loader2 className="size-3.5 animate-spin" />
                          Loading run details…
                        </p>
                      )}

                      {detail && (
                        <div className="divide-y divide-border/60">
                          <div className="grid grid-cols-1 gap-px bg-border/60 sm:grid-cols-3">
                            <div className="bg-background px-6 py-3">
                              <p className={FIELD_LABEL}>Run ID</p>
                              <p className="mt-1 break-all font-mono text-xs text-foreground">
                                {detail.id}
                              </p>
                            </div>
                            <div className="bg-background px-6 py-3">
                              <p className={FIELD_LABEL}>Started</p>
                              <p className="mt-1 text-xs text-foreground">
                                {timeAgo(detail.created_at)}
                              </p>
                            </div>
                            <div className="bg-background px-6 py-3">
                              <p className={FIELD_LABEL}>Last update</p>
                              <p className="mt-1 text-xs text-foreground">
                                {timeAgo(detail.updated_at)}
                              </p>
                            </div>
                          </div>

                          {!isTerminalStatus(detail.status) && (
                            <div className="space-y-2 px-6 py-4">
                              <p className={FIELD_LABEL}>Controls</p>
                              <div className="flex flex-wrap gap-2">
                                {detail.status === 'paused' ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={lifecycleAction !== null}
                                    onClick={() =>
                                      void handleLifecycle(detail.id, 'resume')
                                    }
                                  >
                                    <Play className="h-3.5 w-3.5" />
                                    {lifecycleAction === 'resume'
                                      ? 'Resuming...'
                                      : 'Resume'}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={lifecycleAction !== null}
                                    onClick={() =>
                                      void handleLifecycle(detail.id, 'pause')
                                    }
                                  >
                                    <Pause className="h-3.5 w-3.5" />
                                    {lifecycleAction === 'pause'
                                      ? 'Pausing...'
                                      : 'Pause'}
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  disabled={lifecycleAction !== null}
                                  onClick={() =>
                                    void handleLifecycle(detail.id, 'stop')
                                  }
                                >
                                  <Square className="h-3.5 w-3.5" />
                                  {lifecycleAction === 'stop'
                                    ? 'Stopping...'
                                    : 'Stop'}
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                Pause stops new workflow steps. A browser task
                                that is already running may finish its current
                                safe step; Stop requests safe cancellation
                                before submission.
                              </p>
                              {lifecycleError && (
                                <p className="text-xs text-red-500 dark:text-red-400">
                                  {lifecycleError}
                                </p>
                              )}
                            </div>
                          )}

                          {detail.apply_tasks.length > 0 && (
                            <div className="space-y-2 px-6 py-4">
                              <p className={FIELD_LABEL}>
                                Applications · {detail.apply_tasks.length}
                              </p>
                              <div className="max-h-[420px] divide-y divide-border/60 overflow-y-auto rounded-[6px] border border-border bg-background">
                                {detail.apply_tasks.map((task) => (
                                  <div
                                    key={task.job_id}
                                    className="px-3.5 py-3 text-xs"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="font-medium leading-snug text-foreground">
                                          {applyTaskLabel(task)}
                                        </p>
                                        {task.application_url ? (
                                          <a
                                            href={task.application_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-0.5 inline-block truncate text-muted-foreground underline"
                                          >
                                            View job posting
                                          </a>
                                        ) : null}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-2">
                                        <ApplicationStatusBadge
                                          status={task.status}
                                        />
                                        {task.application_id ? (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setOpenApplicationId(
                                                task.application_id!,
                                              );
                                              setOpenApplicationMeta({
                                                jobTitle: task.job_title,
                                                companyName: task.company_name,
                                              });
                                            }}
                                          >
                                            Open
                                          </Button>
                                        ) : null}
                                      </div>
                                    </div>
                                    {task.linkedin_connect_status && (
                                      <div className="mt-1.5">
                                        <LinkedInConnectBadge
                                          status={task.linkedin_connect_status}
                                        />
                                      </div>
                                    )}
                                    {task.error_detail && (
                                      <p className="mt-1 text-red-500 dark:text-red-400">
                                        {task.error_detail}
                                      </p>
                                    )}
                                    {(task.status === 'captcha_blocked' ||
                                      task.status === 'login_required') && (
                                      <p className="mt-1 text-amber-600 dark:text-amber-400">
                                        Manual action needed
                                        {task.page_url ? (
                                          <>
                                            {' '}
                                            —{' '}
                                            <a
                                              href={task.page_url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="underline"
                                            >
                                              open the page
                                            </a>
                                            , complete the check, then retry.
                                          </>
                                        ) : (
                                          '. Open the application page, complete the check, then retry.'
                                        )}
                                      </p>
                                    )}
                                    {task.page_url &&
                                      task.status !== 'captcha_blocked' &&
                                      task.status !== 'login_required' && (
                                        <a
                                          href={task.page_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="mt-1 inline-block text-muted-foreground underline"
                                        >
                                          Page at failure
                                        </a>
                                      )}
                                    {task.screenshot_path && (
                                      <ScreenshotLink
                                        workflowId={detail.id}
                                        jobId={task.job_id}
                                        screenshotPath={task.screenshot_path}
                                      />
                                    )}
                                    {task.status === 'submitted' ||
                                    task.status === 'already_applied' ? (
                                      <OutcomeSelect
                                        workflowId={detail.id}
                                        jobId={task.job_id}
                                        applicationId={task.application_id}
                                        value={task.outcome ?? null}
                                        onChange={(outcome) => {
                                          setDetail((current) => {
                                            if (!current) return current;
                                            return {
                                              ...current,
                                              apply_tasks:
                                                current.apply_tasks.map(
                                                  (item) =>
                                                    item.job_id === task.job_id
                                                      ? { ...item, outcome }
                                                      : item,
                                                ),
                                            };
                                          });
                                        }}
                                      />
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 gap-px bg-border/60 lg:grid-cols-2">
                            <div className="space-y-2 bg-background px-6 py-4">
                              <p className={FIELD_LABEL}>Live events</p>
                              {events.length > 0 ? (
                                <ol className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-[6px] border border-border">
                                  {events.map((event) => {
                                    const timestamp = eventTimestamp(event);
                                    const detailText = eventDetail(event);
                                    return (
                                      <li
                                        key={eventKey(event)}
                                        className="px-3 py-2 text-xs"
                                      >
                                        <div className="flex items-center justify-between gap-2">
                                          <p className="truncate font-medium capitalize text-foreground">
                                            {eventLabel(event)}
                                          </p>
                                          {timestamp && (
                                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                              {timeAgo(timestamp)}
                                            </span>
                                          )}
                                        </div>
                                        {detailText && (
                                          <p className="truncate text-muted-foreground">
                                            {detailText}
                                          </p>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ol>
                              ) : (
                                <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
                                  Waiting for workflow events…
                                </p>
                              )}
                            </div>

                            <div className="space-y-2 bg-background px-6 py-4">
                              <p className={FIELD_LABEL}>
                                Discovered jobs ·{' '}
                                {detail.discovered_jobs.length}
                              </p>
                              {detail.discovered_jobs.length > 0 ? (
                                <ul className="max-h-56 divide-y divide-border/60 overflow-y-auto rounded-[6px] border border-border">
                                  {detail.discovered_jobs.map((job) => (
                                    <li
                                      key={job.external_id}
                                      className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-medium text-foreground">
                                          {job.title}
                                        </p>
                                        <p className="truncate text-muted-foreground">
                                          {job.company_name}
                                          {job.location && ` · ${job.location}`}
                                          {job.seniority &&
                                            ` · ${job.seniority}`}
                                        </p>
                                      </div>
                                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                                        {job.filter_score.toFixed(1)}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="font-mono text-[11px] text-muted-foreground">
                                  No jobs discovered in this run.
                                </p>
                              )}
                            </div>
                          </div>

                          {detail.errors.length > 0 && (
                            <div className="space-y-2 px-6 py-4">
                              <p
                                className={`${FIELD_LABEL} !text-red-500 dark:!text-red-400`}
                              >
                                Errors · {detail.errors.length}
                              </p>
                              <div className="max-h-32 divide-y divide-red-500/10 overflow-y-auto rounded-[6px] border border-red-500/20 bg-red-500/5">
                                {detail.errors.map((err, i) => (
                                  <p
                                    key={i}
                                    className="px-3 py-1.5 font-mono text-[11px] text-red-600 dark:text-red-400"
                                  >
                                    {err}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={Workflow}
            title="No runs yet"
            description="When you apply to jobs, each batch becomes a run here with a live, step-by-step timeline."
            action={
              <Button asChild size="sm">
                <Link href="/dashboard/discovery">
                  Discover jobs
                  <ArrowRight />
                </Link>
              </Button>
            }
          />
        )}
      </section>

      {openApplicationId ? (
        <ApplicationModal
          applicationId={openApplicationId}
          jobTitle={openApplicationMeta.jobTitle}
          companyName={openApplicationMeta.companyName}
          onClose={() => setOpenApplicationId(null)}
        />
      ) : null}
    </div>
  );
}

function screenshotFile(path: string): string | null {
  const parts = path.split(/[/\\]/).filter(Boolean);
  const filename = parts.at(-1);
  return filename && !filename.includes('..') ? filename : null;
}

function ScreenshotLink({
  workflowId,
  jobId,
  screenshotPath,
}: {
  workflowId: string;
  jobId: string;
  screenshotPath: string;
}) {
  const filename = screenshotFile(screenshotPath);
  if (!filename) return null;
  const href = `/api/workflows/${encodeURIComponent(workflowId)}/screenshot?jobId=${encodeURIComponent(jobId)}&file=${encodeURIComponent(filename)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 inline-block text-muted-foreground underline"
    >
      View screenshot
    </a>
  );
}

function OutcomeSelect({
  workflowId,
  jobId,
  applicationId,
  value,
  onChange,
}: {
  workflowId: string;
  jobId: string;
  applicationId?: string | null;
  value: string | null;
  onChange: (outcome: string) => void;
}) {
  async function handleChange(outcome: string) {
    onChange(outcome);
    await fetch(`/api/workflows/${encodeURIComponent(workflowId)}/outcome`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        applicationId: applicationId ?? undefined,
        outcome,
      }),
    }).catch(() => undefined);
  }

  return (
    <label className="mt-2 flex items-center gap-2 text-muted-foreground">
      <span className="font-mono text-[11px] uppercase tracking-wider">
        Outcome
      </span>
      <select
        className="h-7 rounded-[6px] border border-border bg-background px-1.5 text-xs text-foreground focus:border-neutral-500 focus:outline-none"
        value={value ?? ''}
        onChange={(event) => {
          void handleChange(event.target.value);
        }}
      >
        <option value="">Not tracked</option>
        <option value="viewed">Viewed</option>
        <option value="rejected">Rejected</option>
        <option value="interview">Interview</option>
        <option value="offer">Offer</option>
      </select>
    </label>
  );
}

const LINKEDIN_CONNECT: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'LinkedIn connects queued', tone: 'info' },
  sent: { label: 'LinkedIn connects sent', tone: 'success' },
  login_required: { label: 'LinkedIn session required', tone: 'warning' },
  failed: { label: 'LinkedIn connects failed', tone: 'danger' },
  skipped: { label: 'LinkedIn connects skipped', tone: 'neutral' },
};

function LinkedInConnectBadge({ status }: { status: string }) {
  const c = LINKEDIN_CONNECT[status] ?? {
    label: `LinkedIn: ${status}`,
    tone: 'neutral' as const,
  };
  return <StatusPill tone={c.tone}>{c.label}</StatusPill>;
}
