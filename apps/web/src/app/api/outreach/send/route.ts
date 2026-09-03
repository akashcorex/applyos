import { outreachSendSchema, parseJsonBody } from '@applyso/validation';

import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const OUTREACH_AGENT_URL =
  process.env.OUTREACH_AGENT_URL ?? 'http://127.0.0.1:8004';

export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Outreach service is not configured' },
      { status: 503 },
    );
  }

  const parsed = await parseJsonBody(request, outreachSendSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const res = await fetch(`${OUTREACH_AGENT_URL}/outreach/send`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...parsed.data, user_id: userOrErr }),
      signal: AbortSignal.timeout(20000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json(
      { error: 'Outreach agent is unreachable' },
      { status: 502 },
    );
  }
}
