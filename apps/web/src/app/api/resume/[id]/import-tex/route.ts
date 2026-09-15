import {
  RequestBodyTooLargeError,
  readRequestBodyWithLimit,
  tooLargeResponse,
} from '@/lib/request-body';
import { assertResumeOwner, requireUserId } from '@/lib/require-user';

const RESUME_AGENT_URL =
  process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
const MAX_IMPORT_REQUEST_BYTES = 300_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const userId = userOrErr;
  const { id } = await params;

  const forbidden = await assertResumeOwner(id, userId);
  if (forbidden) return forbidden;

  try {
    const body = await readRequestBodyWithLimit(
      request,
      MAX_IMPORT_REQUEST_BYTES,
    );
    const formData = await new Response(body as unknown as BodyInit, {
      headers: {
        'Content-Type': request.headers.get('content-type') ?? '',
      },
    }).formData();
    const res = await fetch(
      `${RESUME_AGENT_URL}/resume/${encodeURIComponent(id)}/import-tex`,
      {
        method: 'POST',
        headers: { 'X-User-Id': userId },
        body: formData,
        signal: AbortSignal.timeout(60000),
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
