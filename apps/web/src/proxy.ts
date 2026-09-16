import { type NextRequest, NextResponse } from 'next/server';

import { lookupMe } from '@/lib/proxy-session';
import { serverApiUrl } from '@/lib/server-api-url';

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

  const session = await lookupMe(req.headers.get('cookie'), serverApiUrl());

  if (isDashboard) {
    if (session.status === 'unavailable') return NextResponse.next();
    if (session.status !== 'authenticated') return redirectTo(req, '/login');
    if (
      pathname.startsWith('/dashboard/admin') &&
      session.me.user.role !== 'ADMIN'
    ) {
      return redirectTo(req, '/dashboard');
    }
    if (session.me.onboarding && !session.me.onboarding.onboardingComplete) {
      return redirectTo(req, '/onboarding');
    }
    return NextResponse.next();
  }

  if (isOnboarding) {
    if (session.status === 'unavailable') return NextResponse.next();
    if (session.status !== 'authenticated') return redirectTo(req, '/login');
    if (session.me.onboarding?.onboardingComplete) {
      return redirectTo(req, '/dashboard');
    }
    return NextResponse.next();
  }

  if (session.status === 'authenticated') return redirectTo(req, '/dashboard');
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
