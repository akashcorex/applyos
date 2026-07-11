'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@org/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@org/ui/card';

interface AgentHealth {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'offline';
  details: Record<string, unknown> | null;
}

const statusColors: Record<AgentHealth['status'], string> = {
  healthy: 'bg-green-100 text-green-800 border-green-300',
  degraded: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  offline: 'bg-red-100 text-red-800 border-red-300',
};

const statusDots: Record<AgentHealth['status'], string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-yellow-500',
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
          <p className="text-sm text-muted-foreground">Connecting to agents...</p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <div
                key={agent.name}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`h-2 w-2 rounded-full ${statusDots[agent.status]}`}
                  />
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-muted-foreground">
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
