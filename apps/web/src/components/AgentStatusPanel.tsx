'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@applyso/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';

interface AgentHealth {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'offline';
  details: Record<string, unknown> | null;
}

const statusColors: Record<AgentHealth['status'], string> = {
  healthy:
    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  degraded:
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  offline: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

const statusDots: Record<AgentHealth['status'], string> = {
  healthy: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  offline: 'bg-red-500',
};

export function AgentStatusPanel() {
  const [agents, setAgents] = useState<AgentHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHealth() {
      try {
        const res = await fetch('/api/agent-health');
        const data = await res.json();
        setAgents(data);
      } catch {
        // keep stale data
      } finally {
        setLoading(false);
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  const overall =
    agents.length === 0 || loading
      ? 'loading'
      : agents.every((a) => a.status === 'healthy')
        ? 'healthy'
        : agents.every((a) => a.status === 'offline')
          ? 'offline'
          : 'degraded';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Agents</CardTitle>
        <Badge
          variant="outline"
          className={
            overall === 'healthy'
              ? statusColors.healthy
              : overall === 'degraded' || overall === 'loading'
                ? statusColors.degraded
                : statusColors.offline
          }
        >
          {overall === 'loading' ? '...' : overall}
        </Badge>
      </CardHeader>
      <CardContent>
        {loading && agents.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
            Connecting to agents...
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center justify-between rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] px-3.5 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${statusDots[agent.status]}`}
                  />
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                      {agent.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-[#8a8f9d] font-mono">
                      :{agent.port}
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className={statusColors[agent.status]}>
                  {agent.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
