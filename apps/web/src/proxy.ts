import { type NextRequest, NextResponse } from 'next/server';

import { serverApiUrl } from '@/lib/server-api-url';

interface MeResponse {
  user: { role: string };
  onboarding?: {
    hasResume: boolean;
    hasProfile: boolean;
    profileConfirmed: boolean;
    onboardingComplete: boolean;
  };
}

// Session cookies are first-party on the web origin (set via /api/auth/*).
// Forward them to the API; do not assume they were issued on the API host.
async function fetchMe(cookie: string | null): Promise<MeResponse | null> {
  if (!cookie) return null;
  try {
    const res = await fetch(`${serverApiUrl()}/v1/me`, {
      headers: { cookie },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}

function redirectTo(req: NextRequest, path: string): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = '';
  return NextResponse.redirect(url);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isOnboarding = pathname === '/onboarding';
  const isDashboard =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/');

  if (!isAuthPage && !isOnboarding && !isDashboard) {
    return NextResponse.next();
  }

  const me = await fetchMe(req.headers.get('cookie'));

  if (isDashboard) {
    if (!me) return redirectTo(req, '/login');
    if (!me.onboarding?.onboardingComplete)
      return redirectTo(req, '/onboarding');
    if (pathname.startsWith('/dashboard/admin') && me.user.role !== 'ADMIN') {
      return redirectTo(req, '/dashboard');
    }
    return NextResponse.next();
  }

  if (isOnboarding) {
    if (!me) return redirectTo(req, '/login');
    if (me.onboarding?.onboardingComplete) return redirectTo(req, '/dashboard');
    return NextResponse.next();
  }

  if (me) return redirectTo(req, '/dashboard');
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/onboarding',
    '/dashboard',
    '/dashboard/:path*',
  ],
};
