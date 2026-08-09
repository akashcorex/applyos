'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';

import { Badge, Button, Input, toast } from '@applyso/ui';
import { ArrowRight, Loader2, Mail } from 'lucide-react';

import {
  getEarlyAccessCount,
  registerEarlyAccessEmail,
} from '@/app/actions/early-access';

function useSignupCount() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    getEarlyAccessCount()
      .then(setCount)
      .catch(() => {
        // silently ignore count fetch errors
      });
  }, []);

  return { count, setCount };
}

function EmailForm({
  onBumpCount,
}: {
  onBumpCount: () => void;
}) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setLoading(true);

      try {
        const result = await registerEarlyAccessEmail(email.trim());

        if (!result.ok) {
          toast({
            title: 'Something went wrong',
            description: result.error ?? 'Please try again.',
            variant: 'destructive',
          });
          return;
        }

        const isNew = !result.alreadyRegistered;

        toast({
          title: isNew ? "One less thing to worry about." : 'Already on the list',
          description: isNew
            ? "Your future AI job agent is warming up. We'll email you when it's ready."
            : 'This email is already on the priority list.',
          variant: 'default',
        });

        onBumpCount();
        setEmail('');
      } catch {
        toast({
          title: 'Network error',
          description: 'Please check your connection and try again.',
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [email, onBumpCount],
  );

  return (
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
          required
          disabled={loading}
          className="h-9 border-0 bg-transparent pl-2.5 pr-2 text-sm font-medium text-white placeholder:text-white/45 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
      <Button
        type="submit"
        disabled={loading}
        className="h-8 rounded-full bg-white hover:bg-white/90 text-slate-950 px-3 text-xs font-semibold shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98] shrink-0"
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5 text-slate-950" />
        )}
        <span>Get access</span>
      </Button>
    </form>
  );
}

export default function EarlyAccessPage() {
  const { count, setCount } = useSignupCount();

  const bumpCount = useCallback(() => {
    setCount((c) => (c != null ? c + 1 : c));
  }, [setCount]);

  return (
    <div className="min-h-screen w-full bg-white/20 p-3 sm:p-5 flex flex-col">
      <div
        className="relative flex-1 min-h-[calc(100vh-2.5rem)] w-full flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-800/60 bg-cover bg-center bg-no-repeat shadow-2xl"
        style={{ backgroundImage: "url('/bg.png')" }}
      >
        {/* Subtle, soft dark gradient overlay for legibility without white washout */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950/30 via-slate-950/15 to-transparent md:w-2/3" />
        <div className="pointer-events-none absolute inset-0 backdrop-blur-[0.5px]" />

        {/* Ambient warm glow */}
        <div className="pointer-events-none absolute inset-0 flex items-center">
          <div className="absolute top-1/3 left-10 h-80 w-80 rounded-full bg-amber-500/10 blur-3xl" />
        </div>

        {/* Navbar */}
        <nav className="relative z-10 flex w-full items-center justify-between px-6 sm:px-10 py-5">
          <div className="flex items-center gap-3">
            <img src="/logo-white.png" alt="APPLYOS.in" className="h-5 w-auto object-contain" />
          </div>

          <Badge variant="outline" className="flex items-center gap-2 border-slate-900/15 bg-white/50 px-3.5 py-1.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-md rounded-xl">
            <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
            <span>Early Access</span>
          </Badge>
        </nav>

        {/* Main Left-Aligned Hero Section */}
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
              Be first to every opportunity that matters. ApplyOS finds high-growth roles, tailors your applications, and reaches out automatically.
            </p>

            <div className="mt-5 w-full max-w-[30rem]">
              <EmailForm onBumpCount={bumpCount} />
            </div>

            {count != null && count > 0 && (
              <div className="mt-2 px-1 flex items-center gap-2 text-xs text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
                Join <span className="text-white/60">{count}+</span> builders on the priority list
              </div>
            )}
          </div>
        </main>

        {/* Footer */}
        <footer className="relative z-10 flex w-full items-center px-6 sm:px-10 py-5 text-xs font-semibold text-white/80">
          <div>© {new Date().getFullYear()} ApplyOS Inc. All rights reserved.</div>
        </footer>
      </div>
    </div>
  );
}
