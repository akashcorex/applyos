'use client';

import { type FormEvent, useEffect, useState } from 'react';

import Link from 'next/link';
import { Loader2 } from 'lucide-react';

import { loginSchema, signupSchema, validateAction } from '@applyso/validation';

import { AuthCardLayout } from '@/components/auth/AuthCardLayout';
import { LinkedinIcon } from '@/components/icons/LinkedinIcon';
import {
  appCallbackURL,
  authClient,
  navigateAfterAuth,
} from '@/lib/auth-client';

type AuthMode = 'login' | 'signup';

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98Z"
      />
    </svg>
  );
}

const fieldClass =
  'mt-1 w-full rounded-xl border border-neutral-800 bg-neutral-900/60 px-3.5 py-2.5 text-sm text-white placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-white/10';

export default function AuthForm({ mode }: { mode: AuthMode }) {
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromAuth = params.get('error');
    const prefill = params.get('email');
    if (fromAuth) {
      setError(
        fromAuth === 'redirect_uri_mismatch'
          ? 'Google sign-in is misconfigured. Contact support.'
          : fromAuth,
      );
    }
    if (prefill) setEmail(prefill);
  }, []);

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    if (isSignup) {
      const validated = validateAction(signupSchema, { name, email, password });
      if (!validated.ok) {
        setLoading(false);
        setError(validated.error);
        return;
      }
      const result = await authClient.signUp.email({
        name: validated.data.name,
        email: validated.data.email,
        password: validated.data.password,
        callbackURL: appCallbackURL('/dashboard'),
      });
      if (result.error) {
        setLoading(false);
        setError(result.error.message ?? 'Sign up failed');
      } else {
        navigateAfterAuth('/dashboard');
      }
      return;
    }

    const validated = validateAction(loginSchema, { email, password });
    if (!validated.ok) {
      setLoading(false);
      setError(validated.error);
      return;
    }
    const result = await authClient.signIn.email({
      email: validated.data.email,
      password: validated.data.password,
      rememberMe,
      callbackURL: appCallbackURL('/dashboard'),
    });
    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? 'Sign in failed');
    } else {
      navigateAfterAuth('/dashboard');
    }
  }

  async function handleSocialLogin(provider: 'google' | 'linkedin') {
    setLoading(true);
    setError(null);
    const result = await authClient.signIn.social({
      provider,
      callbackURL: appCallbackURL('/dashboard'),
    });
    if (result.error) {
      setLoading(false);
      setError(result.error.message ?? `${provider} sign-in failed`);
    }
  }

  return (
    <AuthCardLayout>
      <div className="space-y-8">
        <div className="text-center">
          <div className="mb-6 flex justify-center md:hidden">
            <Link href="/">
              <img
                src="/logo-white.png"
                alt="ApplyOS"
                className="h-10 w-auto object-contain"
              />
            </Link>
          </div>
          <h2 className="bg-[radial-gradient(61.17%_178.53%_at_38.83%_-13.54%,#3B3B3B_0%,#888787_12.61%,#FFFFFF_50%,#888787_80%,#3B3B3B_100%)] bg-clip-text text-4xl font-bold tracking-tight text-transparent">
            {isSignup ? 'Welcome to ApplyOS' : 'Welcome back'}
          </h2>
          <p className="mt-3 text-sm text-neutral-400">
            {isSignup
              ? 'Start applying while you study'
              : 'Sign in to continue your applications'}
          </p>
        </div>

        <form onSubmit={handleEmailSubmit} className="space-y-4">
          {isSignup ? (
            <label className="block text-xs font-medium text-neutral-300">
              Name
              <input
                required
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className={fieldClass}
              />
            </label>
          ) : null}
          <label className="block text-xs font-medium text-neutral-300">
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="block text-xs font-medium text-neutral-300">
            Password
            <input
              required
              minLength={isSignup ? 8 : undefined}
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={fieldClass}
            />
          </label>
          {!isSignup ? (
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-400">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => setRememberMe(event.target.checked)}
              />
              Remember me
            </label>
          ) : null}
          {error ? (
            <div className="rounded-xl border border-red-900/50 bg-red-950/40 p-3 text-xs font-medium text-red-300">
              {error}
            </div>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="group relative inline-flex h-12 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-neutral-700 bg-gradient-to-r from-neutral-800 to-neutral-900 px-8 text-sm font-medium text-white shadow-lg transition-all duration-200 hover:from-neutral-700 hover:to-neutral-800 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading
              ? isSignup
                ? 'Creating account...'
                : 'Signing in...'
              : isSignup
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

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

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => void handleSocialLogin('google')}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 px-4 text-sm font-medium text-white transition-all hover:border-neutral-700 hover:bg-neutral-800/50 disabled:opacity-50"
          >
            <GoogleIcon />
            Google
          </button>
          <button
            type="button"
            onClick={() => void handleSocialLogin('linkedin')}
            disabled={loading}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-neutral-800 bg-neutral-900/50 px-4 text-sm font-medium text-white transition-all hover:border-neutral-700 hover:bg-neutral-800/50 disabled:opacity-50"
          >
            <LinkedinIcon className="h-4 w-4 text-[#0A66C2]" />
            LinkedIn
          </button>
        </div>

        <p className="text-center text-sm text-neutral-500">
          {isSignup ? 'Already have an account? ' : "Don't have an account? "}
          <Link
            href={isSignup ? '/login' : '/signup'}
            className="font-medium text-neutral-200 underline transition-colors hover:text-white"
          >
            {isSignup ? 'Sign in' : 'Sign up'}
          </Link>
        </p>
      </div>
    </AuthCardLayout>
  );
}
