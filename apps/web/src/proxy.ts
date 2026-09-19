import { type NextRequest, NextResponse } from 'next/server';

import { lookupMe } from '@/lib/proxy-session';
import { serverApiUrl } from '@/lib/server-api-url';

function redirectTo(req: NextRequest, path: string): NextResponse {
  const url = req.nextUrl.clone();
  const qIndex = path.indexOf('?');
  if (qIndex === -1) {
    url.pathname = path;
    url.search = '';
  } else {
    url.pathname = path.slice(0, qIndex);
    url.search = path.slice(qIndex);
  }
  return NextResponse.redirect(url);
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isOnboarding = pathname === '/onboarding';
  const isDashboard =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  const isAdminPath = pathname.startsWith('/dashboard/admin');

  if (!isAuthPage && !isOnboarding && !isDashboard) {
    return NextResponse.next();
  }

  const session = await lookupMe(req.headers.get('cookie'), serverApiUrl());

  if (isDashboard) {
    if (session.status === 'unavailable') return NextResponse.next();
    if (session.status === 'suspended') {
      return redirectTo(req, '/login?error=account_suspended');
    }
    if (session.status !== 'authenticated') return redirectTo(req, '/login');
    const isAdmin = session.me.user.role === 'ADMIN';
    if (isAdminPath) {
      if (!isAdmin) {
        return redirectTo(req, '/dashboard');
      }
      return NextResponse.next();
    }
    if (isAdmin) {
      return redirectTo(req, '/dashboard/admin');
    }
    if (session.me.onboarding && !session.me.onboarding.onboardingComplete) {
      return redirectTo(req, '/onboarding');
    }
    return NextResponse.next();
  }

  if (isOnboarding) {
    if (session.status === 'unavailable') return NextResponse.next();
    if (session.status === 'suspended') {
      return redirectTo(req, '/login?error=account_suspended');
    }
    if (session.status !== 'authenticated') return redirectTo(req, '/login');
    if (session.me.onboarding?.onboardingComplete) {
      return redirectTo(
        req,
        session.me.user.role === 'ADMIN' ? '/dashboard/admin' : '/dashboard',
      );
    }
    return NextResponse.next();
  }

  if (session.status === 'suspended') {
    if (
      pathname === '/login' &&
      req.nextUrl.searchParams.get('error') === 'account_suspended'
    ) {
      return NextResponse.next();
    }
    return redirectTo(req, '/login?error=account_suspended');
  }
  if (session.status === 'authenticated') {
    return redirectTo(
      req,
      session.me.user.role === 'ADMIN' ? '/dashboard/admin' : '/dashboard',
    );
  }
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
