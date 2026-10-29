'use client';

import { useCallback, useEffect, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';
import { Loader2 } from '@applyso/ui/icons';

import {
  type OpsSnapshot,
  fetchAdminOps,
  sendAdminTestAlert,
} from '@/lib/admin-api';

const REFRESH_MS = 30_000;

function rateLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

function ageLabel(seconds: number): string {
  if (seconds < 90) return `${seconds}s ago`;
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  return `${Math.round(seconds / 3600)}h ago`;
}

function severityClasses(severity: string): string {
  if (severity === 'CRITICAL') return 'bg-red-50 text-red-700 border-red-200';
  return 'bg-amber-50 text-amber-700 border-amber-200';
}

export default function AdminOpsPage() {
  const [snapshot, setSnapshot] = useState<OpsSnapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchAdminOps();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ops');
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  async function runTestAlert() {
    setTesting(true);
    setTestResult(null);
    try {
      await sendAdminTestAlert();
      setTestResult('TEST alert delivered — check the on-call channel.');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Test alert failed');
    } finally {
      setTesting(false);
    }
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading ops
      </div>
    );
  }

  const openAlerts = snapshot?.alerts.filter((alert) => alert.state === 'open') ?? [];
  const paymentCritical = (snapshot?.paymentFailures.last1h ?? 0) >= 3;

  return (
    <div className="mx-auto max-w-[1240px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-[#f1f3f9]">
            Ops
          </h1>
          <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-[#8a8f9d]">
            Monitoring + alerting (G3): heartbeats, queue depth, automation
            success per board, payment failures.
            {snapshot ? ` Snapshot ${new Date(snapshot.generatedAt).toLocaleTimeString()}.` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()}>
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void runTestAlert()}
            disabled={testing || !snapshot?.alertWebhookConfigured}
            title={
              snapshot?.alertWebhookConfigured
                ? 'Send a labeled TEST alert to the on-call channel'
                : 'Set ALERT_WEBHOOK_URL on the API to enable test alerts'
            }
          >
            {testing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            Send test alert
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      ) : null}
      {testResult ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          {testResult}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="md:col-span-2">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">
              Alerts ({openAlerts.length} open)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            {openAlerts.length === 0 ? (
              <p className="text-slate-500">
                No open alerts. Rules: service down (CRITICAL), queue depth
                &gt;50 for 10m (WARNING), board success &lt;60% over 24h with
                ≥10 attempts (WARNING), ≥3 payment failures in 1h (CRITICAL).
              </p>
            ) : (
              <ul className="space-y-2">
                {openAlerts.map((alert) => (
                  <li
                    key={`${alert.ruleKey}:${alert.target}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span
                      className={`rounded border px-1.5 py-0.5 font-medium ${severityClasses(alert.severity)}`}
                    >
                      {alert.severity}
                    </span>
                    <span className="font-medium text-slate-800 dark:text-[#c6cad8]">
                      {alert.ruleKey}
                    </span>
                    <span className="text-slate-500">{alert.target}</span>
                    {alert.lastFiredAt ? (
                      <span className="text-slate-400">
                        fired {new Date(alert.lastFiredAt).toLocaleTimeString()}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {!snapshot?.alertWebhookConfigured ? (
              <p className="mt-2 text-amber-600">
                ALERT_WEBHOOK_URL is not configured on the API — alerts are
                recorded but not delivered.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Services</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            <ul className="space-y-2">
              {(snapshot?.services ?? []).map((service) => (
                <li
                  key={service.service}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        service.stale ? 'bg-red-500' : 'bg-emerald-500'
                      }`}
                    />
                    <span className="font-medium text-slate-800 dark:text-[#c6cad8]">
                      {service.service}
                    </span>
                    {service.version ? (
                      <span className="text-slate-400">{service.version}</span>
                    ) : null}
                  </span>
                  <span className={service.stale ? 'text-red-600' : 'text-slate-500'}>
                    {service.stale
                      ? `stale · ${ageLabel(service.ageSeconds)}`
                      : ageLabel(service.ageSeconds)}
                  </span>
                </li>
              ))}
              {snapshot && snapshot.services.length === 0 ? (
                <li className="text-slate-500">
                  No heartbeats yet — services report every 60s after restart.
                </li>
              ) : null}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Queues + API errors</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            <ul className="space-y-2">
              {(snapshot?.queueDepths ?? []).map((queue) => (
                <li
                  key={`${queue.service}:${queue.metric}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="text-slate-600 dark:text-[#aeb3c2]">
                    {queue.service} · {queue.metric.replace('queue.', '')}
                  </span>
                  <span
                    className={
                      queue.current > 50 ? 'font-medium text-amber-600' : 'text-slate-700 dark:text-[#c6cad8]'
                    }
                  >
                    {Math.floor(queue.current)}
                  </span>
                </li>
              ))}
              {snapshot && snapshot.queueDepths.length === 0 ? (
                <li className="text-slate-500">
                  No queue metrics yet — apply-agent reports depths every 60s.
                </li>
              ) : null}
              <li className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2 dark:border-[#23263a]">
                <span className="text-slate-600 dark:text-[#aeb3c2]">
                  api · 5xx last hour
                </span>
                <span
                  className={
                    (snapshot?.api.http5xxLastHour ?? 0) > 0
                      ? 'font-medium text-red-600'
                      : 'text-slate-700 dark:text-[#c6cad8]'
                  }
                >
                  {snapshot?.api.http5xxLastHour ?? 0}
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Automation success per board</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            {snapshot && snapshot.boards.length > 0 ? (
              <table className="w-full text-left">
                <thead className="text-slate-400">
                  <tr>
                    <th className="py-1 font-normal">Board</th>
                    <th className="py-1 font-normal">24h</th>
                    <th className="py-1 font-normal">14d</th>
                    <th className="py-1 font-normal">24h submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.boards.map((board) => (
                    <tr key={board.board} className="border-t border-slate-100 dark:border-[#23263a]">
                      <td className="py-1.5 font-medium text-slate-800 dark:text-[#c6cad8]">
                        {board.board}
                      </td>
                      <td
                        className={`py-1.5 ${
                          board.attempts24h >= 10 &&
                          board.successRate24h !== null &&
                          board.successRate24h < 0.6
                            ? 'text-red-600'
                            : 'text-slate-700 dark:text-[#c6cad8]'
                        }`}
                      >
                        {rateLabel(board.successRate24h)}
                      </td>
                      <td className="py-1.5 text-slate-600 dark:text-[#aeb3c2]">
                        {rateLabel(board.successRate14d)}
                      </td>
                      <td className="py-1.5 text-slate-500">
                        {board.submitted24h}/{board.attempts24h}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-500">
                No finished applications in the last 14 days.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm">Payment failures</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 text-xs">
            <div className="flex gap-6">
              <div>
                <div
                  className={`text-lg font-semibold ${
                    paymentCritical ? 'text-red-600' : 'text-slate-800 dark:text-[#c6cad8]'
                  }`}
                >
                  {snapshot?.paymentFailures.last1h ?? 0}
                </div>
                <div className="text-slate-500">last 1h (≥3 fires CRITICAL)</div>
              </div>
              <div>
                <div className="text-lg font-semibold text-slate-800 dark:text-[#c6cad8]">
                  {snapshot?.paymentFailures.last24h ?? 0}
                </div>
                <div className="text-slate-500">last 24h</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
