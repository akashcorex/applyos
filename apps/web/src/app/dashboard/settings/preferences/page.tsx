'use client';

import { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@applyso/ui/card';
import { Button } from '@applyso/ui/button';
import { Input } from '@applyso/ui/input';
import { Sliders, Bot, Check } from 'lucide-react';

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
        const data = (await res.json()) as { autoSubmitEnabled?: boolean };
        setAutoSubmitEnabled(Boolean(data.autoSubmitEnabled));
      } finally {
        setLoading(false);
      }
    }
    void loadPreferences();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoSubmitEnabled }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-slate-900 dark:text-[#f1f3f9]">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-[#f1f3f9] tracking-tight">
          Agent Preferences & Limits
        </h1>
        <p className="text-xs text-slate-500 dark:text-[#8a8f9d] mt-0.5">
          Configure autonomous application throughput, matchmaking score
          thresholds, and alert notifications.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Agent Limits Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sliders className="h-4 w-4 text-slate-900 dark:text-[#f1f3f9]" />
              <CardTitle className="text-sm font-semibold text-slate-900 dark:text-[#f1f3f9]">
                Automation Throughput
              </CardTitle>
            </div>
            <CardDescription className="text-xs text-slate-500 dark:text-[#8a8f9d]">
              Control how aggressively autonomous agents apply on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSave} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  Daily Application Limit
                </label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                />
                <span className="text-[10px] text-slate-500 dark:text-[#8a8f9d] mt-1 block">
                  Maximum applications submitted per 24-hour cycle.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 dark:text-[#8a8f9d] uppercase tracking-wider mb-1.5 font-mono">
                  Minimum AI Match Score Threshold (%)
                </label>
                <Input
                  type="number"
                  min="50"
                  max="100"
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value)}
                />
                <span className="text-[10px] text-slate-500 dark:text-[#8a8f9d] mt-1 block">
                  Jobs scoring below this threshold will be skipped.
                </span>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoSubmitEnabled}
                    disabled={loading}
                    onChange={(e) => setAutoSubmitEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 dark:border-[#26282e] bg-white dark:bg-[#141518] text-slate-900 dark:text-[#f1f3f9] focus:ring-slate-900 dark:focus:ring-[#f1f3f9]"
                  />
                  <span>
                    Auto-submit applications without manual approval
                  </span>
                </label>
                <span className="text-[10px] text-slate-500 dark:text-[#8a8f9d] mt-1 block ml-5">
                  When off, you review the filled form in the live browser and
                  approve before submission.
                </span>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={emailAlerts}
                    onChange={(e) => setEmailAlerts(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-300 dark:border-[#26282e] bg-white dark:bg-[#141518] text-slate-900 dark:text-[#f1f3f9] focus:ring-slate-900 dark:focus:ring-[#f1f3f9]"
                  />
                  <span>
                    Send daily email summary of submitted applications
                  </span>
                </label>
              </div>

              <div className="pt-2 flex items-center gap-3">
                <Button type="submit" size="sm" className="rounded-[6px]">
                  {saved ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span>Preferences Saved</span>
                    </>
                  ) : (
                    <span>Save Agent Preferences</span>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Autonomous Engine Health */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-slate-900 dark:text-[#f1f3f9]" />
                <CardTitle className="text-xs font-semibold text-slate-900 dark:text-[#f1f3f9]">
                  Engine Safety Guards
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-xs text-slate-500 dark:text-[#8a8f9d]">
              <div className="p-2 rounded-[6px] bg-slate-50 dark:bg-[#0e0f12] border border-slate-200 dark:border-[#22242a] text-[11px] space-y-1">
                <div className="flex justify-between text-slate-900 dark:text-[#f1f3f9] font-medium">
                  <span>Duplicate Protection</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    ENABLED
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
                  Prevents reapplying to previously targeted companies.
                </p>
              </div>

              <div className="p-2 rounded-[6px] bg-slate-50 dark:bg-[#0e0f12] border border-slate-200 dark:border-[#22242a] text-[11px] space-y-1">
                <div className="flex justify-between text-slate-900 dark:text-[#f1f3f9] font-medium">
                  <span>Rate Jitter</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400">
                    ENABLED
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#8a8f9d]">
                  Randomizes submission timestamps to mimic human behavior.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
