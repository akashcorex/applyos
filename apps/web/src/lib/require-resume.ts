import { serverApiUrl } from '@/lib/server-api-url';

import type { MeResponse } from './proxy-session';

export function canApplyFromMe(
  me: Pick<MeResponse, 'onboarding'> | null,
): boolean {
  if (!me?.onboarding) return false;
  return me.onboarding.canApply ?? me.onboarding.hasResume;
}

export const RESUME_REQUIRED_ERROR = 'Upload a resume before applying.';

export async function requireHasResume(
  request: Request,
): Promise<true | Response> {
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch(`${serverApiUrl()}/v1/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!res.ok) {
      return Response.json({ error: 'API is unavailable' }, { status: 502 });
    }
    const me = (await res.json()) as MeResponse;
    if (!canApplyFromMe(me)) {
      return Response.json(
        { error: RESUME_REQUIRED_ERROR, code: 'RESUME_REQUIRED' },
        { status: 422 },
      );
    }
    return true;
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}
