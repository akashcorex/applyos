'use client';

import Link from 'next/link';

import { ArrowRight, CheckCircle2, LogIn, UserPlus } from 'lucide-react';

import { Button } from '@applyso/ui';

export function HeroSection() {
  return (
    <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 sm:px-10 lg:px-16 py-12 text-center">
      <div className="flex max-w-3xl flex-col items-center text-center">
        {/* Top Tagline / YC style badge */}
        <div className="mb-4 inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-1.5 backdrop-blur-md transition-all hover:bg-white/15">
          <span className="flex h-5 w-5 items-center justify-center rounded-[4px] bg-[#FF6600] text-[11px] font-black text-white leading-none">
            Y
          </span>
          <span className="text-xs font-medium text-white/90">
            Autonomous AI Job Search & Outreach Engine
          </span>
        </div>

        {/* Main Title */}
        <h1 className="text-balance text-[clamp(2.8rem,5.5vw,4.8rem)] font-bold tracking-[-0.04em] text-white leading-[1.05] antialiased [text-shadow:_0_2px_10px_rgba(0,0,0,0.4)]">
          Your AI applies
          <span className="block bg-gradient-to-r from-amber-200 via-white to-slate-200 bg-clip-text text-transparent">
            while you study.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 max-w-xl text-base sm:text-lg leading-relaxed text-white/75 font-normal antialiased">
          Be first to every opportunity that matters. ApplyOS finds high-growth
          roles, custom-tailors your applications, and manages recruiter
          outreach on your behalf.
        </p>

        {/* Centered CTA Buttons — Login & Signup Flow */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3.5 w-full max-w-md">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto flex-1 h-12 px-7 rounded-full bg-white hover:bg-white/90 text-slate-950 font-semibold text-sm shadow-xl transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <Link
              href="/signup"
              className="flex items-center justify-center gap-2"
            >
              <UserPlus className="h-4 w-4 text-slate-950" />
              <span>Sign up for free</span>
              <ArrowRight className="h-4 w-4 text-slate-950" />
            </Link>
          </Button>

          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto flex-1 h-12 px-7 rounded-full border-white/30 bg-slate-950/40 hover:bg-slate-900/80 text-white font-medium text-sm backdrop-blur-xl shadow-lg transition-all hover:scale-[1.03] active:scale-[0.98]"
          >
            <Link
              href="/login"
              className="flex items-center justify-center gap-2"
            >
              <LogIn className="h-4 w-4 text-white/90" />
              <span>Log in to account</span>
            </Link>
          </Button>
        </div>

        {/* Feature Highlights Pills */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-xs text-white/70">
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
