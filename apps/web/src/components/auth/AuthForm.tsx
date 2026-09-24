'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import { Google, Loader2 } from '@applyso/ui/icons';

import { AuthCardLayout } from '@/components/auth/AuthCardLayout';
import { appCallbackURL, authClient } from '@/lib/auth-client';

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
            className="pressable group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-neutral-700 bg-gradient-to-r from-neutral-800 to-neutral-900 px-8 text-sm font-medium text-white shadow-lg hover:from-neutral-700 hover:to-neutral-800 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50"
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
            className="pressable inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 px-8 text-sm font-medium text-white shadow-sm hover:border-neutral-700 hover:bg-neutral-800/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:pointer-events-none disabled:opacity-50"
          >
            {signingIn ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <Google className="h-4 w-4" />
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
