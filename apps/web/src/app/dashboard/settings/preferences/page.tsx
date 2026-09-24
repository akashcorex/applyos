'use client';

import { useEffect, useState } from 'react';

import { Bot, Check, ShieldCheck, Sliders, Zap } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';

export default function PreferencesSettingsPage() {
  const [dailyLimit, setDailyLimit] = useState('25');
  const [minScore, setMinScore] = useState('80');
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [autoSubmitEnabled, setAutoSubmitEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadPreferences() {
      try {
        const res = await fetch('/api/preferences', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as {
          autoSubmitEnabled?: boolean;
          dailyLimit?: number;
          minScore?: number;
        };
        setAutoSubmitEnabled(Boolean(data.autoSubmitEnabled));
        if (typeof data.dailyLimit === 'number') {
          setDailyLimit(String(data.dailyLimit));
        }
        if (typeof data.minScore === 'number') {
          setMinScore(String(data.minScore));
        }
      } finally {
        setLoading(false);
      }
    }
    void loadPreferences();
  }, []);

  async function handleSave(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        autoSubmitEnabled,
        dailyLimit: Number(dailyLimit),
        minScore: Number(minScore),
      }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="w-full bg-background text-foreground animate-fadeIn">
      {/* ── 1. Page Header Bar (Full-bleed) ───────────────────── */}
      <div className="w-full border-b border-border bg-background px-6 sm:px-8 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground font-sans">
            Agent Preferences & Limits
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Autonomous application throughput, matchmaking score thresholds, and execution safety guardrails
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-[4px] border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-xs font-mono">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            ENGINE ACTIVE
          </span>
          <Button
            type="button"
            onClick={() => void handleSave()}
            size="sm"
            disabled={loading}
            className="h-8 rounded-[6px] bg-foreground text-background hover:bg-zinc-200 text-xs font-mono font-medium"
          >
            {saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                Saved
              </>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </div>
      </div>

      {/* ── 2. 4-Column KPI Summary Strip ─────────────────────── */}
      <div className="w-full grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border bg-background">
        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Daily Cap
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {dailyLimit} / day
          </p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            max 24h cycle
          </p>
        </div>

        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Match Threshold
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {minScore}%
          </p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            minimum fit barrier
          </p>
        </div>

        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Dispatch Mode
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-foreground font-sans">
            {autoSubmitEnabled ? 'Autonomous' : 'Semi-Auto'}
          </p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            {autoSubmitEnabled ? 'Instant dispatch' : 'Review & approve'}
          </p>
        </div>

        <div className="px-6 sm:px-8 py-4">
          <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Safety Guardrails
          </p>
          <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-emerald-400 font-sans">
            Enforced
          </p>
          <p className="mt-0.5 text-[11px] font-mono text-zinc-500">
            2 of 2 active
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        {/* ── 3. Section: Automation Throughput & Thresholds ───── */}
        <section
          aria-label="Automation throughput"
          className="w-full border-b border-border bg-background"
        >
          <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
            <div className="flex items-center gap-3">
              <Sliders className="h-3.5 w-3.5 text-zinc-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Automation Capacity & Thresholds
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              Per-candidate throughput controls
            </span>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-5 space-y-2">
              <label
                htmlFor="pref-daily-limit"
                className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Daily Application Limit
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="pref-daily-limit"
                  type="number"
                  min="1"
                  max="100"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  className="h-8 w-44 text-xs font-mono bg-neutral-900/40 border-border"
                />
                <span className="text-xs font-mono text-zinc-400">
                  applications / 24h
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Maximum number of automated job submissions launched per 24-hour rolling window.
              </p>
            </div>

            <div className="px-6 sm:px-8 py-5 space-y-2">
              <label
                htmlFor="pref-min-score"
                className="block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Minimum AI Match Score (%)
              </label>
              <div className="flex items-center gap-3">
                <Input
                  id="pref-min-score"
                  type="number"
                  min="50"
                  max="100"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                  className="h-8 w-44 text-xs font-mono bg-neutral-900/40 border-border"
                />
                <span className="text-xs font-mono text-zinc-400">% match</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Jobs evaluated with semantic score below this percentage will be automatically skipped.
              </p>
            </div>
          </div>
        </section>

        {/* ── 4. Section: Dispatch Controls & Notifications ───── */}
        <section
          aria-label="Dispatch controls"
          className="w-full border-b border-border bg-background"
        >
          <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
            <div className="flex items-center gap-3">
              <Zap className="h-3.5 w-3.5 text-zinc-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Dispatch Controls & Notifications
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              Manual approval & alert channels
            </span>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-5 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoSubmitEnabled}
                  disabled={loading}
                  onChange={(e) => setAutoSubmitEnabled(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-[3px] border-border bg-neutral-900/60 text-foreground focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Auto-submit applications without manual approval
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    When disabled, the agent fills the application form in the cloud browser and waits for your confirmation before final submit.
                  </p>
                </div>
              </label>
            </div>

            <div className="px-6 sm:px-8 py-5 space-y-2">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emailAlerts}
                  onChange={(e) => setEmailAlerts(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded-[3px] border-border bg-neutral-900/60 text-foreground focus:ring-0 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Send daily email digest of submitted applications
                  </span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Receive a consolidated summary email every morning detailing all autonomous submissions and interview alerts.
                  </p>
                </div>
              </label>
            </div>
          </div>
        </section>

        {/* ── 5. Section: Autonomous Engine Safety Guards ─────── */}
        <section
          aria-label="Engine safety guards"
          className="w-full border-b border-border bg-background"
        >
          <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
            <div className="flex items-center gap-3">
              <Bot className="h-3.5 w-3.5 text-zinc-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
                Autonomous Engine Safety Guards
              </h2>
            </div>
            <span className="text-xs font-mono text-zinc-500">
              System-enforced safety policies
            </span>
          </div>

          <div className="w-full grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 sm:px-8 py-5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">
                    Duplicate Target Protection
                  </span>
                </div>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-[3px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ENABLED
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Hashes job identifiers and employer domains to ensure you never apply twice to the same requisition.
              </p>
            </div>

            <div className="px-6 sm:px-8 py-5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-foreground">
                    Human-Mimicking Rate Jitter
                  </span>
                </div>
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-[3px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  ENABLED
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Randomizes keystroke delays, mouse trajectories, and navigation intervals to bypass anti-bot heuristics.
              </p>
            </div>
          </div>
        </section>

        {/* ── 6. Bottom Actions Bar ─────────────────────────────── */}
        <div className="w-full border-b border-border bg-background px-6 sm:px-8 py-3.5 flex items-center justify-between">
          <p className="text-xs font-mono text-zinc-500">
            Changes take effect immediately on next automated runner cycle
          </p>
          <Button
            type="submit"
            size="sm"
            disabled={loading}
            className="h-8 rounded-[6px] bg-foreground text-background hover:bg-zinc-200 text-xs font-mono font-medium"
          >
            {saved ? (
              <>
                <Check className="mr-1.5 h-3.5 w-3.5 text-emerald-600" />
                Preferences Saved
              </>
            ) : (
              'Save Preferences'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
