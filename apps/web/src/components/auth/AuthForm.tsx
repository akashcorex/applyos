'use client';

import { useEffect, useState } from 'react';

import Link from 'next/link';
import Image from 'next/image';
import { Loader2 } from 'lucide-react';

import { AuthCardLayout } from '@/components/auth/AuthCardLayout';
import { appCallbackURL, authClient } from '@/lib/auth-client';

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function AuthForm() {
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const busy = creating || signingIn;

  useEffect(() => {
    const fromAuth = new URLSearchParams(window.location.search).get('error');
    if (!fromAuth) return;
    if (fromAuth === 'redirect_uri_mismatch') {
      setError('Google sign-in is misconfigured. Contact support.');
      return;
    }
    if (fromAuth === 'account_suspended') {
      setError(
        'Your account is suspended or deactivated. Contact support to restore access.',
      );
      return;
    }
    if (fromAuth === 'account_inactive') {
      setError('Your account is not active. Contact support.');
      return;
    }
    setError(fromAuth);
  }, []);

  async function continueWithGoogle(path: '/onboarding' | '/dashboard') {
    setError(null);
    if (path === '/onboarding') setCreating(true);
    else setSigningIn(true);
    const result = await authClient.signIn.social({
      provider: 'google',
      callbackURL: appCallbackURL(path),
    });
    if (result.error) {
      setCreating(false);
      setSigningIn(false);
      setError(result.error.message ?? 'Google sign-in failed');
    }
  }

  return (
    <AuthCardLayout>
      <div className="space-y-8">
        <div className="text-center">
          <div className="mb-6 flex justify-center">
            <Link href="/">
              <Image
                src="/logo-white.png"
                alt="ApplyOS"
                width={48}
                height={48}
                className="h-12 w-12 object-contain"
              />
            </Link>
          </div>
          <h2 className="bg-[radial-gradient(61.17%_178.53%_at_38.83%_-13.54%,#3B3B3B_0%,#888787_12.61%,#FFFFFF_50%,#888787_80%,#3B3B3B_100%)] bg-clip-text text-4xl font-bold tracking-tight text-transparent">
            Welcome to ApplyOS
          </h2>
          <p className="mt-3 text-sm text-neutral-400">
            Start applying while you study
          </p>
        </div>

        <div className="space-y-4">
          {error ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-xs font-medium text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void continueWithGoogle('/onboarding')}
            disabled={busy}
            className="group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-neutral-700 bg-gradient-to-r from-neutral-800 to-neutral-900 px-8 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:from-neutral-700 hover:to-neutral-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-neutral-700 to-neutral-800 opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="relative z-10 inline-flex items-center gap-2">
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </span>
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-black px-4 font-medium text-neutral-500">
                Or continue with
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void continueWithGoogle('/dashboard')}
            disabled={busy}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 px-8 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:border-neutral-700 hover:bg-neutral-800/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50"
          >
            {signingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <GoogleIcon />
                Sign in with Google
              </>
            )}
          </button>
        </div>

        <p className="text-center text-sm leading-relaxed text-neutral-500">
          By signing up, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </AuthCardLayout>
  );
}
