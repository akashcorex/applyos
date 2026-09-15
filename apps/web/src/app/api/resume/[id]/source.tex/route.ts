import {
  RequestBodyTooLargeError,
  readRequestBodyWithLimit,
  tooLargeResponse,
} from '@/lib/request-body';
import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
const MAX_SOURCE_REQUEST_BYTES = 256_000;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxy(request, params, 'GET');
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return proxy(request, params, 'PUT');
}

async function proxy(
  request: Request,
  paramsPromise: Promise<{ id: string }>,
  method: 'GET' | 'PUT',
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;
  const { id } = await paramsPromise;

  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  try {
    const body = await readRequestBodyWithLimit(
      request,
      MAX_SOURCE_REQUEST_BYTES,
    );
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/source.tex`,
      {
        method,
        headers: {
          'X-User-Id': userId,
          ...(method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: method === 'PUT' ? new TextDecoder().decode(body) : undefined,
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return tooLargeResponse();
    }
    return Response.json(
      { error: 'Resume agent is unreachable' },
      { status: 502 },
    );
  }
}
