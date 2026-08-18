'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, RefreshCw } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Badge } from '@applyso/ui/badge';

type WorkflowStatus =
  | 'pending'
  | 'discovering_funding'
  | 'discovering'
  | 'deciding'
  | 'filtering'
  | 'applying'
  | 'completed'
  | 'partial'
  | 'failed';

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
  task_id: string | null;
  status: string;
  error_detail: string | null;
  linkedin_connect_status: string | null;
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

const STATUS_CONFIG: Record<
  WorkflowStatus,
  { label: string; className: string; title?: string }
> = {
  pending: {
    label: 'Pending',
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  },
  discovering_funding: {
    label: 'Funding',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  discovering: {
    label: 'Discovering',
    className: 'bg-blue-100 text-blue-800 border-blue-300',
  },
  deciding: {
    label: 'Deciding',
    className: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  filtering: {
    label: 'Filtering',
    className: 'bg-purple-100 text-purple-800 border-purple-300',
  },
  applying: {
    label: 'Applying',
    className: 'bg-orange-100 text-orange-800 border-orange-300',
  },
  completed: {
    label: 'Completed',
    className: 'bg-green-100 text-green-800 border-green-300',
  },
  partial: {
    label: 'Partial',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    title: 'Some apply tasks finished, but not all succeeded',
  },
  failed: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 border-red-300',
  },
};

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

  async function fetchWorkflows() {
    try {
      const res = await fetch('/api/workflows');
      const data = await res.json();
      setWorkflows(data.workflows ?? []);
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
    try {
      const res = await fetch(`/api/workflows/${id}`);
      if (!res.ok) {
        setDetail(null);
        return;
      }
      const data = await res.json();
      setDetail(data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkflows();
    const interval = setInterval(fetchWorkflows, 15000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  useEffect(() => {
    if (!focusWorkflowId) {
      return;
    }
    void loadWorkflowDetail(focusWorkflowId);
  }, [focusWorkflowId]);

  async function handleToggle(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    await loadWorkflowDetail(id);
  }

  const count =
    workflows.length > 0 ? `${workflows.length} recent` : 'None';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Workflows</CardTitle>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{count}</Badge>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              setLoading(true);
              void fetchWorkflows();
            }}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading workflows...
          </p>
        ) : workflows.length > 0 ? (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {workflows.map((wf) => {
              const cfg = STATUS_CONFIG[wf.status] ?? STATUS_CONFIG.pending;
              return (
                <div key={wf.id}>
                  <button
                    type="button"
                    onClick={() => handleToggle(wf.id)}
                    className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {expandedId === wf.id ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate font-mono text-xs">
                        {shortId(wf.id)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs px-1.5 py-0 ${cfg.className}`}
                        title={cfg.title}
                      >
                        {cfg.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                      {wf.job_count > 0 && (
                        <span>{wf.job_count} jobs</span>
                      )}
                      {wf.apply_total > 0 && (
                        <span
                          className={
                            wf.apply_successful < wf.apply_total
                              ? 'text-red-600'
                              : 'text-green-600'
                          }
                        >
                          {wf.apply_successful}/{wf.apply_total} ok
                        </span>
                      )}
                      <span className="flex items-center gap-0.5 whitespace-nowrap">
                        <Clock className="h-3 w-3" />
                        {timeAgo(wf.created_at)}
                      </span>
                    </div>
                  </button>

                  {expandedId === wf.id && (
                    <div className="ml-4 border-l-2 pl-4 py-2 space-y-3 text-sm">
                      {detailLoading && (
                        <p className="text-xs text-muted-foreground">
                          Loading details...
                        </p>
                      )}

                      {detail && (
                        <>
                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground">
                              ID
                            </p>
                            <p className="font-mono text-xs break-all">
                              {detail.id}
                            </p>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">
                                Created
                              </p>
                              <p>{timeAgo(detail.created_at)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Updated
                              </p>
                              <p>{timeAgo(detail.updated_at)}</p>
                            </div>
                          </div>

                          {detail.discovered_jobs.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                Discovered Jobs (
                                {detail.discovered_jobs.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {detail.discovered_jobs.map((job) => (
                                  <div
                                    key={job.external_id}
                                    className="rounded border px-2 py-1 text-xs"
                                  >
                                    <p className="font-medium truncate">
                                      {job.title}
                                    </p>
                                    <p className="text-muted-foreground truncate">
                                      {job.company_name}
                                      {job.location && ` · ${job.location}`}
                                      {job.seniority &&
                                        ` · ${job.seniority}`}
                                    </p>
                                    <p className="text-muted-foreground">
                                      Score: {job.filter_score.toFixed(1)}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {detail.apply_tasks.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium">
                                Apply Tasks (
                                {detail.apply_tasks.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {detail.apply_tasks.map((task) => (
                                  <div
                                    key={task.job_id}
                                    className="rounded border px-2 py-1 text-xs"
                                  >
                                    <div className="flex items-center justify-between">
                                      <p className="font-medium truncate">
                                        {task.job_title}
                                      </p>
                                      <ApplyStatusBadge
                                        status={task.status}
                                      />
                                    </div>
                                    <p className="text-muted-foreground truncate">
                                      {task.company_name}
                                    </p>
                                    {task.linkedin_connect_status && (
                                      <div className="mt-1">
                                        <LinkedInConnectBadge
                                          status={task.linkedin_connect_status}
                                        />
                                      </div>
                                    )}
                                    {task.error_detail && (
                                      <p className="text-red-600 truncate">
                                        {task.error_detail}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {detail.errors.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-red-600">
                                Errors ({detail.errors.length})
                              </p>
                              <div className="space-y-1 max-h-32 overflow-y-auto">
                                {detail.errors.map((err, i) => (
                                  <p
                                    key={i}
                                    className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700"
                                  >
                                    {err}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No workflows running. Paste a careers page URL in the Company
            Discovery panel and the orchestrator will coordinate agents to
            discover and apply to jobs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ApplyStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string }
  > = {
    queued: {
      label: 'Queued',
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    submitted: {
      label: 'Submitted',
      className: 'bg-green-100 text-green-800 border-green-300',
    },
    already_applied: {
      label: 'Already Applied',
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    failed: {
      label: 'Failed',
      className: 'bg-red-100 text-red-800 border-red-300',
    },
    captcha_blocked: {
      label: 'Captcha',
      className: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    },
    login_required: {
      label: 'Login',
      className: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    timed_out: {
      label: 'Timed Out',
      className: 'bg-red-100 text-red-800 border-red-300',
    },
    skipped: {
      label: 'Skipped',
      className: 'bg-gray-100 text-gray-500 border-gray-300',
    },
  };
  const c = config[status] ?? {
    label: status,
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  };
  return (
    <Badge
      variant="outline"
      className={`text-xs px-1.5 py-0 ${c.className}`}
    >
      {c.label}
    </Badge>
  );
}

function LinkedInConnectBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string }
  > = {
    pending: {
      label: 'LinkedIn connects queued',
      className: 'bg-blue-100 text-blue-800 border-blue-300',
    },
    sent: {
      label: 'LinkedIn connects sent',
      className: 'bg-green-100 text-green-800 border-green-300',
    },
    login_required: {
      label: 'LinkedIn session required',
      className: 'bg-orange-100 text-orange-800 border-orange-300',
    },
    failed: {
      label: 'LinkedIn connects failed',
      className: 'bg-red-100 text-red-800 border-red-300',
    },
    skipped: {
      label: 'LinkedIn connects skipped',
      className: 'bg-gray-100 text-gray-600 border-gray-300',
    },
  };
  const c = config[status] ?? {
    label: `LinkedIn: ${status}`,
    className: 'bg-gray-100 text-gray-700 border-gray-300',
  };
  return (
    <Badge
      variant="outline"
      className={`text-xs px-1.5 py-0 ${c.className}`}
    >
      {c.label}
    </Badge>
  );
}
