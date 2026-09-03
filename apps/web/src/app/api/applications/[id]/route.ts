import { authorizeApplicationOwner } from '@/lib/application-authorization';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeApplicationOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const headers = {
    'X-Agent-Service-Token': process.env.AGENT_SERVICE_TOKEN ?? '',
  };

  try {
    const res = await fetch(
      `${process.env.API_URL ?? 'http://localhost:5000'}/v1/applications/internal/${encodeURIComponent(id)}/detail`,
      {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (!res.ok) {
      return Response.json(
        { error: 'Failed to load application detail' },
        { status: res.status },
      );
    }

    return Response.json(await res.json());
  } catch {
    return Response.json(
      { error: 'Application service is unavailable' },
      { status: 502 },
    );
  }
}
