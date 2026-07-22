import { Sparkles } from 'lucide-react';

import { EarlyAccessForm } from '../components/EarlyAccessForm';
import { WaitlistCount } from '../components/WaitlistCount';
import { GrainTexture } from '../components/GrainTexture';

export default function EarlyAccessPage() {
  return (
    <main className="relative flex min-h-screen w-full items-stretch justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black p-3 sm:p-6">
      <GrainTexture className="opacity-[0.07] mix-blend-overlay" />
      {/* Card frame */}
      <div className="relative flex w-full max-w-8xl flex-col overflow-hidden rounded-xl border border-white/10 bg-slate-900/60 shadow-[0_2px_24px_rgba(0,0,0,0.3)] backdrop-blur-sm">
        {/* Vertical hairlines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-6 w-px bg-white/[0.08] sm:left-16"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-6 w-px bg-white/[0.08] sm:right-16"
        />

        {/* Header */}
        <header className="relative flex h-20 items-center justify-center border-b border-white/[0.08] sm:h-24">
          <div className="flex items-center gap-2 text-white">
            <Sparkles className="h-5 w-5" />
            <span className="text-lg font-bold tracking-tight">Outreach Autometer</span>
          </div>
        </header>

        {/* Hero */}
        <section className="relative flex flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center sm:py-24">
          <span className="inline-flex items-center rounded-full border border-white/10 bg-white/10 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-blue-200 shadow-sm backdrop-blur-sm">
            Launching soon
          </span>

          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.05] tracking-tight text-white sm:text-6xl">
            Every dream job
            <br />
            starts with one outreach
          </h1>

          <p className="max-w-md text-base leading-relaxed text-blue-200/80 sm:text-lg">
            AI-powered job outreach automation. Get early access and be the
            first to experience the future of job hunting.
          </p>

          <EarlyAccessForm />
        </section>

        {/* Social proof */}
        <div className="relative border-t border-white/[0.08] px-6 py-7">
          <WaitlistCount />
        </div>

        {/* Footer */}
        <footer className="relative flex items-center justify-center gap-2 border-t border-white/[0.08] px-6 py-5 text-xs text-blue-200/60">
          <span>© 2026</span>
          <span>•</span>
          <span>Outreach Autometer</span>
          <span>•</span>
          <span>Built for job seekers</span>
        </footer>
      </div>
    </main>
  );
}
