import type { ProfileCompletion, ProfileNextAction } from '@applyso/validation';

export interface MeResponse {
  user: { role: string };
  onboarding?: {
    hasResume: boolean;
    hasProfile: boolean;
    profileConfirmed: boolean;
    canApply?: boolean;
    onboardingComplete: boolean;
  };
  completion?: Pick<
    ProfileCompletion,
    'percent' | 'filled' | 'total' | 'missing' | 'nextAction'
  >;
}

export type { ProfileNextAction };

export type SessionStatus = 'authenticated' | 'unauthenticated' | 'unavailable';

export type SessionLookup =
  | { status: 'authenticated'; me: MeResponse }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

export function classifyMeStatus(httpStatus: number): SessionStatus {
  if (httpStatus === 200) return 'authenticated';
  if (httpStatus === 401 || httpStatus === 403 || httpStatus === 404) {
    return 'unauthenticated';
  }
  return 'unavailable';
}

export function sessionStatusFromLookup(
  cookie: string | null,
  httpStatus: number | null,
): SessionStatus {
  if (!cookie) return 'unauthenticated';
  if (httpStatus === null) return 'unavailable';
  return classifyMeStatus(httpStatus);
}

export async function lookupMe(
  cookie: string | null,
  apiUrl: string,
): Promise<SessionLookup> {
  if (!cookie) return { status: 'unauthenticated' };
  try {
    const res = await fetch(`${apiUrl}/v1/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const status = classifyMeStatus(res.status);
    if (status === 'authenticated') {
      return { status, me: (await res.json()) as MeResponse };
    }
    return { status };
  } catch {
    return { status: 'unavailable' };
  }
}
