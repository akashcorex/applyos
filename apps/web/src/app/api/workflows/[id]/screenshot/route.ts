import {
  agentServiceHeaders,
  authorizeWorkflowOwner,
  jobIdBelongsToWorkflow,
} from '@/lib/workflow-authorization';

const APPLY_AGENT_URL = process.env.APPLY_AGENT_URL ?? 'http://127.0.0.1:8003';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const authorization = await authorizeWorkflowOwner(request, id);
  if (authorization instanceof Response) return authorization;

  const url = new URL(request.url);
  const jobId = url.searchParams.get('jobId');
  const filename = url.searchParams.get('file');
  if (
    !jobId ||
    !filename ||
    filename.includes('/') ||
    filename.includes('\\')
  ) {
    return Response.json({ error: 'Invalid artifact' }, { status: 400 });
  }
  if (!jobIdBelongsToWorkflow(id, jobId)) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Workflow service is not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `${APPLY_AGENT_URL}/admin/artifacts/${encodeURIComponent(jobId)}/${encodeURIComponent(filename)}`,
      { headers, cache: 'no-store', signal: AbortSignal.timeout(15000) },
    );
    if (!res.ok) {
      return Response.json(
        { error: 'Screenshot not found' },
        { status: res.status },
      );
    }
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/png',
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch {
    return Response.json(
      { error: 'Apply agent is unreachable' },
      { status: 502 },
    );
  }
}
