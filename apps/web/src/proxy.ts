import { type NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000';

interface MeResponse {
  user: { role: string };
  onboarding?: {
    hasResume: boolean;
    hasProfile: boolean;
    profileConfirmed: boolean;
    onboardingComplete: boolean;
  };
}

// Session lives in a cookie scoped to the API host; the browser sends it to
// the web origin too (same host in dev, same site in prod), so the proxy can
// validate server-side instead of trusting client-side redirects.
// Deliberately uncached: role/status must never be stale here (a suspended
// or demoted user must be blocked on their next request). Revisit only if
// the per-navigation roundtrip measurably hurts latency.
async function fetchMe(cookie: string | null): Promise<MeResponse | null> {
  if (!cookie) return null;
  try {
    const res = await fetch(`${API_URL}/v1/me`, {
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
