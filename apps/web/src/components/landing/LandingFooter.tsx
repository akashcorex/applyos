'use client';

import Link from 'next/link';

export function LandingFooter() {
  return (
    <footer className="relative z-10 flex w-full flex-col sm:flex-row items-center justify-between px-6 sm:px-10 py-5 text-xs font-medium text-white/60 gap-3 border-t border-white/10 bg-slate-950/20 backdrop-blur-md">
      <div>© {new Date().getFullYear()} ApplyOS Inc. All rights reserved.</div>

      <div className="flex items-center gap-6 text-white/70">
        <Link href="/login" className="hover:text-white transition-colors">
          Sign In
        </Link>
        <Link href="/signup" className="hover:text-white transition-colors">
          Create Account
        </Link>
      </div>
    </footer>
  );
}
