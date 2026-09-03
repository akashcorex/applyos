'use client';

import { HeroSection } from './HeroSection';
import { LandingFooter } from './LandingFooter';
import { LandingHeader } from './LandingHeader';

export function LandingPage() {
  return (
    <div className="min-h-screen w-full bg-slate-950 p-2 sm:p-4 flex flex-col antialiased">
      <div
        className="relative flex-1 min-h-[calc(100vh-2rem)] w-full flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/80 bg-cover bg-center bg-no-repeat shadow-2xl"
        style={{ backgroundImage: "url('/bg.png')" }}
      >
        {/* Soft gradient overlay for contrast */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/40 to-slate-950/80" />
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[1px]" />

        {/* Ambient warm glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
          <div className="h-80 w-80 rounded-full bg-indigo-500/10 blur-[100px]" />
        </div>

        {/* Header Navigation */}
        <LandingHeader />

        {/* Main Title Landing Hero */}
        <HeroSection />

        {/* Footer */}
        <LandingFooter />
      </div>
    </div>
  );
}

export default LandingPage;
