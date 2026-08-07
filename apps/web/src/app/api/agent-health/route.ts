const AGENTS = [
  { name: 'Orchestrator', url: 'http://127.0.0.1:8001/health', port: 8001 },
  { name: 'Job Agent', url: 'http://127.0.0.1:8002/health', port: 8002 },
  { name: 'Apply Agent', url: 'http://127.0.0.1:8003/health', port: 8003 },
  { name: 'Outreach Agent', url: 'http://127.0.0.1:8004/health', port: 8004 },
  { name: 'Resume Agent', url: 'http://127.0.0.1:8005/health', port: 8005 },
] as const;

interface AgentHealth {
  name: string;
  port: number;
  status: 'healthy' | 'degraded' | 'offline';
  details: Record<string, unknown> | null;
}

export async function GET() {
  const results: AgentHealth[] = await Promise.all(
    AGENTS.map(async ({ name, url, port }) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
        const json = await res.json();
        return {
          name,
          port,
          status: json.status === 'healthy' ? 'healthy' : 'degraded',
          details: json,
        };
      } catch {
        return { name, port, status: 'offline' as const, details: null };
      }
    }),
  );

  return Response.json(results);
}
