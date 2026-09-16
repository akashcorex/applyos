import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

async function forward(
  request: Request,
  id: string,
  method: 'PUT' | 'DELETE',
): Promise<Response> {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const response = await fetch(
      `${API_URL}/v1/jobs/${encodeURIComponent(id)}/save`,
      {
        method,
        headers: { cookie: request.headers.get('cookie') ?? '' },
        signal: AbortSignal.timeout(10000),
      },
    );
    const data = await response.json().catch(() => ({}));
    return Response.json(data, { status: response.status });
  } catch {
    return Response.json(
      { error: 'Job service is unavailable' },
      { status: 502 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forward(request, id, 'PUT');
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return forward(request, id, 'DELETE');
}
