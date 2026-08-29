'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Linkedin, Loader2 } from 'lucide-react';

import { appCallbackURL, authClient } from '@/lib/auth-client';
import { AuthCardLayout } from '@/components/auth/AuthCardLayout';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleEmailLogin(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signInError } = await authClient.signIn.email({
      email,
      password,
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

  return (
    <AuthCardLayout headlineLine1="EXPLORE." headlineLine2="LEARN. GROW.">
      {/* Top Header Section */}
      <div className="flex flex-col items-center text-center">
        {/* Brand Icon Badge */}
        <div className="h-10 w-10 rounded-md bg-slate-950 p-2 shadow-md flex items-center justify-center mb-3">
          <img src="/logo-white.png" alt="ApplyOS" className="h-4 w-auto object-contain" />
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
          <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1">
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
          <label htmlFor="password" className="block text-xs font-bold text-slate-700 mb-1">
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

        {/* Options Row: Remember Me & Forgot Password */}
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

          <Link href="#" className="text-slate-500 hover:text-slate-900 font-semibold transition-colors">
            Forgot Password
          </Link>
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
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : null}
          <span>{loading ? 'Signing in...' : 'Sign In'}</span>
        </button>

        {/* Social Login Button */}
        <button
          type="button"
          onClick={handleLinkedInLogin}
          disabled={loading}
          className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-xs py-2.5 rounded-md shadow-sm transition-all duration-150 tactile-btn flex items-center justify-center gap-2 mt-3"
        >
          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
          <span>Sign in with LinkedIn</span>
        </button>
      </form>

      {/* Footer Link */}
      <p className="mt-6 text-center text-xs text-slate-500 font-medium">
        Don't have an account?{' '}
        <Link href="/signup" className="font-bold text-slate-900 hover:underline">
          Sign up
        </Link>
      </p>
    </AuthCardLayout>
  );
}
