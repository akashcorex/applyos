'use client';

import { type FormEvent, useEffect, useState } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Loader2 } from 'lucide-react';

import { loginSchema, validateAction } from '@applyso/validation';

import { AuthCardLayout } from '@/components/auth/AuthCardLayout';
import { LinkedinIcon } from '@/components/icons/LinkedinIcon';
import { appCallbackURL, authClient } from '@/lib/auth-client';

function GoogleIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
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

export default function LoginPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isPending && session) {
      router.replace('/dashboard');
    }
  }, [isPending, session, router]);

  if (!isPending && session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <Loader2 className="h-6 w-6 animate-spin text-white/70" />
      </div>
    );
  }

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    const validated = validateAction(loginSchema, { email, password });
    if (!validated.ok) {
      setError(validated.error);
      return;
    }
    setLoading(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({
      email: validated.data.email,
      password: validated.data.password,
      callbackURL: '/dashboard',
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message ?? 'Sign in failed');
      return;
    }

    router.push('/dashboard');
  }

  async function handleLinkedInLogin() {
    setLoading(true);
    setError(null);

    await authClient.signIn.social({
      provider: 'linkedin',
      callbackURL: appCallbackURL('/dashboard'),
    });
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);

    await authClient.signIn.social({
      provider: 'google',
      callbackURL: appCallbackURL('/dashboard'),
    });
  }

  return (
    <AuthCardLayout headlineLine1="EXPLORE." headlineLine2="LEARN. GROW.">
      {/* Top Header Section */}
      <div className="flex flex-col items-center text-center">
        {/* Brand Icon Badge */}
        <div className="h-10 w-10 rounded-md bg-slate-950 p-2 shadow-md flex items-center justify-center mb-3">
          <img
            src="/logo-white.png"
            alt="ApplyOS"
            className="h-4 w-auto object-contain"
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase">
          WELCOME BACK
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6 font-medium">
          Enter your email and password to access your account
        </p>
      </div>

      {/* Login Form */}
      <form onSubmit={handleEmailLogin} className="space-y-4 w-full">
        {/* Email Field */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-bold text-slate-700 mb-1"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/90 rounded-md px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:bg-white transition-all duration-150"
          />
        </div>

        {/* Password Field */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-bold text-slate-700 mb-1"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/90 rounded-md px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:bg-white transition-all duration-150"
          />
        </div>

        {/* Options Row: Remember Me */}
        <div className="flex items-center justify-between text-xs pt-1 pb-1">
          <label className="flex items-center gap-2 text-slate-600 font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-950 accent-slate-950"
            />
            <span>Remember me</span>
          </label>
        </div>

        {/* Error Alert */}
        {error ? (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
            {error}
          </div>
        ) : null}

        {/* Primary Action Button */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-950 hover:bg-slate-900 text-white font-semibold text-xs py-2.5 rounded-md shadow-sm transition-all duration-150 tactile-btn disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-white" />
          ) : null}
          <span>{loading ? 'Signing in...' : 'Sign In'}</span>
        </button>

        {/* Divider */}
        <div className="relative flex items-center justify-center my-3">
          <div className="border-t border-slate-200 w-full" />
          <span className="bg-white px-2.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider absolute">
            or continue with
          </span>
        </div>

        {/* Social Login Buttons (Google + LinkedIn) */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-xs py-2 rounded-md shadow-sm transition-all duration-150 tactile-btn flex items-center justify-center gap-2"
          >
            <GoogleIcon className="h-4 w-4" />
            <span>Google</span>
          </button>

          <button
            type="button"
            onClick={handleLinkedInLogin}
            disabled={loading}
            className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-xs py-2 rounded-md shadow-sm transition-all duration-150 tactile-btn flex items-center justify-center gap-2"
          >
            <LinkedinIcon className="h-4 w-4 text-[#0A66C2]" />
            <span>LinkedIn</span>
          </button>
        </div>
      </form>

      {/* Footer Link */}
      <p className="mt-6 text-center text-xs text-slate-500 font-medium">
        Don't have an account?{' '}
        <Link
          href="/signup"
          className="font-bold text-slate-900 hover:underline"
        >
          Sign up
        </Link>
      </p>
    </AuthCardLayout>
  );
}
