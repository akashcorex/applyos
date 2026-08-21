import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
} from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3333';
const POLL_INTERVAL_MS = 3000;

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface WorkflowEvent {
  occurredAt?: string;
  occurred_at?: string;
  createdAt?: string;
  created_at?: string;
  [key: string]: unknown;
}

function eventTimestamp(event: WorkflowEvent): string | null {
  const value =
    event.occurredAt ??
    event.occurred_at ??
    event.createdAt ??
    event.created_at;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    return null;
  }
  return new Date(value).toISOString();
}

function latestCursor(
  events: WorkflowEvent[],
  current: string | null,
): string | null {
  let latest = current;
  for (const event of events) {
    const timestamp = eventTimestamp(event);
    if (!timestamp || !latest || timestamp > latest) latest = timestamp;
  }
  return latest;
}

function parseAfter(value: string | null): string | null | Response {
  if (!value) return null;
  if (!Number.isFinite(Date.parse(value))) {
    return Response.json(
      { error: 'after must be an ISO-8601 timestamp' },
      { status: 400 },
    );
  }
  return new Date(value).toISOString();
}

async function fetchEvents(
  workflowId: string,
  after: string | null,
): Promise<WorkflowEvent[]> {
  const headers = agentServiceHeaders();
  if (!headers) throw new Error('Workflow service is not configured');

  const url = new URL(
    `${API_URL}/v1/workflows/internal/${encodeURIComponent(workflowId)}/events`,
  );
  if (after) url.searchParams.set('after', after);

  const res = await fetch(url, {
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error('Workflow event service is unavailable');

  const data = (await res.json()) as { events?: unknown };
  return Array.isArray(data.events) ? (data.events as WorkflowEvent[]) : [];
}

function encodeSse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeWorkflowOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const after = parseAfter(new URL(request.url).searchParams.get('after'));
  if (after instanceof Response) return after;
  const once = new URL(request.url).searchParams.get('once') === '1';

  if (once) {
    try {
      return Response.json({ events: await fetchEvents(id, after) });
    } catch {
      return Response.json(
        { error: 'Workflow event service is unavailable' },
        { status: 502 },
      );
    }
  }

  const encoder = new TextEncoder();
  let cancelStream: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let cursor = after;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const stop = (closeController: boolean) => {
        if (closed) return;
        closed = true;
        if (timer) clearTimeout(timer);
        if (closeController) controller.close();
      };
      cancelStream = () => stop(false);
      request.signal.addEventListener('abort', () => stop(true), {
        once: true,
      });

      const poll = async () => {
        if (closed) return;
        try {
          const events = await fetchEvents(id, cursor);
          if (closed) return;
          for (const event of events) {
            controller.enqueue(encodeSse('workflow', event));
          }
          cursor = latestCursor(events, cursor);
        } catch {
          if (!closed) {
            controller.enqueue(
              encodeSse('workflow-error', {
                error: 'Workflow event service is unavailable',
              }),
            );
          }
        }

        if (!closed) timer = setTimeout(poll, POLL_INTERVAL_MS);
      };

      controller.enqueue(encoder.encode(': connected\n\n'));
      void poll();
    },
    cancel() {
      cancelStream?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no',
    },
  });
}
