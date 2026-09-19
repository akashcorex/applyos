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

interface AuthFormProps {
  mode: AuthMode;
}

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

export default function AuthForm({ mode }: AuthFormProps) {
  const isSignup = mode === 'signup';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fromAuth = new URLSearchParams(window.location.search).get('error');
    if (fromAuth) {
      setError(
        fromAuth === 'redirect_uri_mismatch'
          ? 'Google sign-in is misconfigured. Contact support.'
          : fromAuth,
      );
    }
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
    <AuthCardLayout
      headlineLine1={isSignup ? 'BUILD.' : 'EXPLORE.'}
      headlineLine2={isSignup ? 'APPLY. SUCCEED.' : 'LEARN. GROW.'}
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-slate-950 p-2 shadow-md">
          <img
            src="/logo-white.png"
            alt="ApplyOS"
            className="h-4 w-auto object-contain"
          />
        </div>
        <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">
          {isSignup ? 'CREATE ACCOUNT' : 'WELCOME BACK'}
        </h1>
        <p className="mb-6 mt-1 text-xs font-medium text-slate-500 sm:text-sm">
          {isSignup
            ? 'Enter your details to create your account and get started'
            : 'Enter your email and password to access your account'}
        </p>
      </div>

      <form onSubmit={handleEmailSubmit} className="w-full space-y-3.5">
        {isSignup ? (
          <label className="block text-xs font-bold text-slate-700">
            Name
            <input
              required
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200/90 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950"
            />
          </label>
        ) : null}
        <label className="block text-xs font-bold text-slate-700">
          Email
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200/90 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950"
          />
        </label>
        <label className="block text-xs font-bold text-slate-700">
          Password
          <input
            required
            minLength={isSignup ? 8 : undefined}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-200/90 bg-slate-50 px-3.5 py-2 text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950"
          />
        </label>
        {!isSignup ? (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            Remember me
          </label>
        ) : null}
        {error ? (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-950 py-2.5 text-xs font-semibold text-white transition hover:bg-slate-900 disabled:opacity-50"
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

      <div className="relative my-4 flex items-center justify-center">
        <div className="w-full border-t border-slate-200" />
        <span className="absolute bg-white px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          or continue with
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => void handleSocialLogin('google')}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <GoogleIcon />
          Google
        </button>
        <button
          type="button"
          onClick={() => void handleSocialLogin('linkedin')}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white py-2 text-xs font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <LinkedinIcon className="h-4 w-4 text-[#0A66C2]" />
          LinkedIn
        </button>
      </div>
      <p className="mt-5 text-center text-xs font-medium text-slate-500">
        {isSignup ? 'Already have an account? ' : "Don't have an account? "}
        <Link
          href={isSignup ? '/login' : '/signup'}
          className="font-bold text-slate-900 hover:underline"
        >
          {isSignup ? 'Sign in' : 'Sign up'}
        </Link>
      </p>
    </AuthCardLayout>
  );
}
