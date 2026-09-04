'use client';

import { useState, type FormEvent } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArrowRight, CheckCircle2, Mail } from 'lucide-react';

import { Button, Input } from '@applyso/ui';

export function HeroSection() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    router.push(
      trimmed ? `/signup?email=${encodeURIComponent(trimmed)}` : '/signup',
    );
  };

  return (
    <main className="relative z-10 flex-1 flex items-center px-6 sm:px-10 lg:px-16 py-6">
      <div className="flex max-w-2xl flex-col items-start text-left">
        <div className="mb-2 flex items-center gap-2.5 text-white/80">
          <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#FF6600] text-[12px] font-black text-white leading-none">
            Y
          </span>
          <span className="text-sm font-medium tracking-[-0.02em]">
            Not backed by YC. Yet.
          </span>
        </div>

        <h1 className="text-balance text-[clamp(3.4rem,5.8vw,5.2rem)] font-medium leading-[0.88] tracking-[-0.05em] text-white antialiased [text-shadow:_0_1px_1px_rgba(0,0,0,0.35),_0_0_1px_rgba(255,255,255,0.1)]">
          Your AI applies
          <span className="block">while you study.</span>
        </h1>

        <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-white/70 antialiased">
          Be first to every opportunity that matters. ApplyOS finds
          high-growth roles, tailors your applications, and reaches out
          automatically.
        </p>

        <div className="mt-5 w-full max-w-[30rem]">
          <form
            onSubmit={handleSubmit}
            className="group relative flex w-full items-center rounded-full border border-white/20 bg-slate-950/40 p-1 shadow-lg backdrop-blur-xl transition-all focus-within:border-white/40 focus-within:bg-slate-950/60 focus-within:ring-2 focus-within:ring-white/10"
          >
            <div className="relative flex flex-1 items-center pl-3">
              <Mail className="h-3.5 w-3.5 text-white/50 transition-colors group-focus-within:text-white/90" />
              <Input
                type="email"
                placeholder="Enter your work email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 border-0 bg-transparent pl-2.5 pr-2 text-sm font-medium text-white placeholder:text-white/45 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
            <Button
              type="submit"
              className="h-8 rounded-full bg-white hover:bg-white/90 text-slate-950 px-3 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
            >
              <ArrowRight className="h-3.5 w-3.5 text-slate-950" />
              <span>Get started</span>
            </Button>
          </form>
        </div>

        <div className="mt-3 px-1 text-xs text-white/40">
          Free to start · Already have an account?{' '}
          <Link
            href="/login"
            className="text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            Log in
          </Link>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 sm:gap-6 text-xs text-white/70">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Instant AI Resume Matching</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>1-Click Autonomous Applications</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>LinkedIn Recruiter Outreach</span>
          </div>
        </div>
      </div>
    </main>
  );
}
