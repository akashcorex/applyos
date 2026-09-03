'use client';

import Link from 'next/link';

import { ArrowRight } from 'lucide-react';

import { Badge, Button } from '@applyso/ui';

export function LandingHeader() {
  return (
    <nav className="relative z-10 flex w-full items-center justify-between px-6 sm:px-10 py-5">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
        >
          <img
            src="/logo-white.png"
            alt="ApplyOS"
            className="h-6 w-auto object-contain"
          />
        </Link>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        <Badge
          variant="outline"
          className="hidden md:flex items-center gap-2 border-slate-700/60 bg-slate-900/40 px-3.5 py-1.5 text-xs font-semibold text-slate-200 shadow-sm backdrop-blur-md rounded-xl"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>AI Autonomous Agent v1.0</span>
        </Badge>

        <Button
          asChild
          variant="ghost"
          className="h-9 px-4 text-xs font-medium text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-all"
        >
          <Link href="/login">Log in</Link>
        </Button>

        <Button
          asChild
          className="h-9 px-4.5 text-xs font-semibold bg-white text-slate-950 hover:bg-white/90 rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Link href="/signup">
            <span>Sign up</span>
            <ArrowRight className="ml-1.5 h-3.5 w-3.5 text-slate-950" />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
