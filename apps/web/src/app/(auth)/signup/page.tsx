'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Linkedin, Loader2 } from 'lucide-react';

import { appCallbackURL, authClient } from '@/lib/auth-client';
import { AuthCardLayout } from '@/components/auth/AuthCardLayout';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const { error: signUpError } = await authClient.signUp.email({
      name,
      email,
      password,
      callbackURL: '/dashboard',
    });

    setLoading(false);

    if (signUpError) {
      setError(signUpError.message ?? 'Sign up failed');
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
    <AuthCardLayout headlineLine1="BUILD." headlineLine2="APPLY. SUCCEED.">
      {/* Top Header Section */}
      <div className="flex flex-col items-center text-center">
        {/* Brand Icon Badge */}
        <div className="h-10 w-10 rounded-2xl bg-slate-950 p-2 shadow-md flex items-center justify-center mb-3">
          <img src="/logo-white.png" alt="ApplyOS" className="h-4 w-auto object-contain" />
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight uppercase">
          CREATE ACCOUNT
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6 font-medium">
          Enter your details to create your account and get started
        </p>
      </div>

      {/* Signup Form */}
      <form onSubmit={handleSignup} className="space-y-3.5 w-full">
        {/* Name Field */}
        <div>
          <label htmlFor="name" className="block text-xs font-semibold text-slate-700 mb-1">
            Name
          </label>
          <input
            id="name"
            type="text"
            required
            placeholder="Enter your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
          />
        </div>

        {/* Email Field */}
        <div>
          <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
          />
        </div>

        {/* Password Field */}
        <div>
          <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1">
            Password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-slate-50/80 border border-slate-200/80 rounded-xl px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:bg-white transition-all"
          />
        </div>

        {/* Error Alert */}
        {error ? (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
            {error}
          </div>
        ) : null}

        {/* Primary Action Button (Black Pill Button) */}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-950 hover:bg-slate-900 text-white font-semibold text-sm py-3 rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-white" /> : null}
          <span>{loading ? 'Creating account...' : 'Create Account'}</span>
        </button>

        {/* Social Login Button */}
        <button
          type="button"
          onClick={handleLinkedInLogin}
          disabled={loading}
          className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-medium text-xs sm:text-sm py-2.5 rounded-xl shadow-sm transition-all hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Linkedin className="h-4 w-4 text-[#0A66C2]" />
          <span>Sign up with LinkedIn</span>
        </button>
      </form>

      {/* Footer Link */}
      <p className="mt-5 text-center text-xs text-slate-500 font-medium">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-slate-900 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCardLayout>
  );
}
