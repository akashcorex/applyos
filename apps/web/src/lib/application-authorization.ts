import { requireUserId } from '@/lib/require-user';
import { agentServiceHeaders } from '@/lib/workflow-authorization';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

export interface DurableApplication {
  id: string;
  userId: string;
  status: string;
  browserSessionId?: string | null;
  currentUrl?: string | null;
  currentStep?: string | null;
  controlMode?: string | null;
  humanInterventionRequired?: boolean | null;
  interventionReason?: string | null;
  [key: string]: unknown;
}

/**
 * Ensures the session user owns the application before forwarding to internal API.
 */
export async function authorizeApplicationOwner(
  request: Request,
  applicationId: string,
): Promise<{ userId: string; application: DurableApplication } | Response> {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  const headers = agentServiceHeaders();
  if (!headers) {
    return Response.json(
      { error: 'Application service is not configured' },
      { status: 503 },
    );
  }

  try {
    const res = await fetch(
      `${API_URL}/v1/applications/internal/${encodeURIComponent(applicationId)}/detail`,
      {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );

    if (res.status === 404) {
      return Response.json({ error: 'Application not found' }, { status: 404 });
    }
    if (!res.ok) {
      return Response.json(
        { error: 'Application service is unavailable' },
        { status: 502 },
      );
    }

    const data = (await res.json()) as { application?: DurableApplication };
    if (!data.application || typeof data.application.userId !== 'string') {
      return Response.json(
        { error: 'Application service returned an invalid response' },
        { status: 502 },
      );
    }
    if (data.application.userId !== userOrErr) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    return { userId: userOrErr, application: data.application };
  } catch {
    return Response.json(
      { error: 'Application service is unavailable' },
      { status: 502 },
    );
  }
}
