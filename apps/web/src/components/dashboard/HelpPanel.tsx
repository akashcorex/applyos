'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { Button } from '@applyso/ui/button';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileUp,
  Mail,
  MessageCircle,
  Zap,
  X,
} from '@applyso/ui/icons';

import { SearchField, type Tone } from '@/components/dashboard/PageChrome';
import { authClient } from '@/lib/auth-client';
import { fetchBillingMe } from '@/lib/billing';
import type { MeResponse } from '@/lib/proxy-session';
import { canApplyFromMe } from '@/lib/require-resume';

const SUPPORT_EMAIL = 'support@applyos.in';

interface Answer {
  q: string;
  a: string;
  link?: { href: string; label: string };
}

const ANSWERS: Answer[] = [
  {
    q: 'How does ApplyOS apply for me?',
    a: 'Pick jobs in Discover Jobs and press Apply, or select several to tailor your resume first. The agent opens each application in a cloud browser, fills it from your profile and resume, and submits it. Every batch becomes a run in Job Tracker.',
    link: { href: '/dashboard/discovery', label: 'Discover jobs' },
  },
  {
    q: 'Why does an application say “Needs you”?',
    a: 'The agent reached a step only a person can do, such as a captcha, a login, or a question it cannot answer safely. Open the application, finish that step in the live browser, and the agent continues from there.',
    link: {
      href: '/dashboard/applications?filter=attention',
      label: 'See applications that need you',
    },
  },
  {
    q: 'What does the match score mean?',
    a: 'It estimates how well a job fits your profile (role, skills, seniority, and location) from 0 to 100%. 85% and above is a strong match. Keeping your profile current improves the scores.',
    link: { href: '/dashboard/profile', label: 'Update profile' },
  },
  {
    q: 'Can I stop an application that is running?',
    a: 'Yes. In Job Tracker, expand the run and press Pause or Stop. A step already in progress may finish safely; Stop cancels before the final submit.',
    link: { href: '/dashboard/workflows', label: 'Open Job Tracker' },
  },
  {
    q: 'Will it apply to the same job twice?',
    a: 'No. Every job is checked before applying, and jobs you have already applied to are skipped.',
  },
  {
    q: 'How many applications can I send?',
    a: 'Your plan includes a number of applications per billing cycle. The Overview shows how many you have used. Upgrade or add a pack in Plans & Billing when you need more.',
    link: { href: '/dashboard/settings/billing', label: 'Plans & Billing' },
  },
  {
    q: 'How do LinkedIn connects work?',
    a: 'They are off until you turn them on in Outreach. After a successful application, the agent sends connection requests to people at that company from its own signed-in LinkedIn session.',
    link: { href: '/dashboard/linkedin', label: 'Open Outreach' },
  },
  {
    q: 'How do I record interviews or offers?',
    a: 'In Job Tracker, open a run and set the Outcome on a submitted application. Interviews and offers then count toward your Overview.',
    link: { href: '/dashboard/workflows', label: 'Open Job Tracker' },
  },
];

const TOPICS = [
  'Application problem',
  'Billing',
  'Account & sign-in',
  'Bug report',
  'Feedback',
] as const;

interface StatusItem {
  tone: Tone;
  text: string;
  href?: string;
  cta?: string;
  icon: typeof Zap;
}

const STATUS_TONES: Record<Tone, string> = {
  neutral: 'text-muted-foreground',
  info: 'text-sky-600 dark:text-sky-400',
  success: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  danger: 'text-red-600 dark:text-red-400',
};

const FIELD_LABEL =
  'block text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground';

function useHelpStatus(open: boolean): StatusItem[] | null {
  const [items, setItems] = useState<StatusItem[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      const [attention, billing, me] = await Promise.all([
        fetch('/api/applications?category=attention', { cache: 'no-store' })
          .then(async (res) =>
            res.ok
              ? (((await res.json()) as { applications?: unknown[] })
                  .applications?.length ?? 0)
              : 0,
          )
          .catch(() => 0),
        fetchBillingMe(),
        fetch('/api/me', { cache: 'no-store' })
          .then(async (res) =>
            res.ok ? ((await res.json()) as MeResponse) : null,
          )
          .catch(() => null),
      ]);
      if (cancelled) return;
      const next: StatusItem[] = [];
      if (me && !canApplyFromMe(me)) {
        next.push({
          tone: 'warning',
          icon: FileUp,
          text: 'Upload a resume so the agent can start applying.',
          href: '/dashboard/profile',
          cta: 'Upload resume',
        });
      }
      if (attention > 0) {
        next.push({
          tone: 'warning',
          icon: AlertTriangle,
          text:
            attention === 1
              ? '1 application is waiting on you.'
              : `${attention} applications are waiting on you.`,
          href: '/dashboard/applications?filter=attention',
          cta: 'Review',
        });
      }
      if (billing && billing.cycle.remaining <= 0) {
        next.push({
          tone: 'danger',
          icon: Zap,
          text: 'You have used every application in this cycle.',
          href: '/dashboard/settings/billing',
          cta: 'Get more',
        });
      }
      if (next.length === 0) {
        next.push({
          tone: 'success',
          icon: CheckCircle2,
          text: 'Nothing needs your attention. The agent is unblocked.',
        });
      }
      setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  return items;
}

function ContactForm({ pathname }: { pathname: string }) {
  const { data: session } = authClient.useSession();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [diagnostics, setDiagnostics] = useState(true);
  const [copied, setCopied] = useState<'report' | 'email' | null>(null);

  const report = useMemo(() => {
    const lines = [message.trim()];
    if (diagnostics) {
      lines.push(
        '',
        '— Diagnostics —',
        `Page: ${pathname}`,
        `Account: ${session?.user?.email ?? 'unknown'} (${session?.user?.id ?? 'unknown'})`,
        `Time: ${new Date().toISOString()}`,
        `Browser: ${typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent}`,
      );
    }
    return lines.join('\n');
  }, [message, diagnostics, pathname, session?.user?.email, session?.user?.id]);

  const ready = message.trim().length >= 10;
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
    `[${topic}] ${message.trim().split('\n')[0].slice(0, 60)}`,
  )}&body=${encodeURIComponent(report)}`;

  async function copy(text: string, kind: 'report' | 'email') {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="help-topic" className={FIELD_LABEL}>
          Topic
        </label>
        <select
          id="help-topic"
          value={topic}
          onChange={(event) =>
            setTopic(event.target.value as (typeof TOPICS)[number])
          }
          className="h-8 w-full rounded-[8px] border border-border bg-background px-2 text-xs text-foreground focus:border-neutral-500 focus:outline-none"
        >
          {TOPICS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="help-message" className={FIELD_LABEL}>
          What happened?
        </label>
        <textarea
          id="help-message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          placeholder="Which job or run, what you expected, and what you saw instead."
          className="w-full resize-y rounded-[8px] border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-neutral-500 focus:outline-none"
        />
      </div>
      <label className="flex cursor-pointer select-none items-start gap-2.5">
        <input
          type="checkbox"
          checked={diagnostics}
          onChange={(event) => setDiagnostics(event.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 cursor-pointer rounded-[5px] border-border bg-background focus:ring-0"
        />
        <span className="text-[11px] text-muted-foreground">
          Include diagnostics (current page, account ID, browser) so we can find
          the problem faster.
        </span>
      </label>
      <div className="flex flex-wrap gap-2">
        {ready ? (
          <Button asChild size="sm">
            <a href={mailto}>
              <Mail />
              Send to support
            </a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            <Mail />
            Send to support
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={!ready}
          onClick={() => void copy(`Topic: ${topic}\n\n${report}`, 'report')}
        >
          {copied === 'report' ? <Check /> : null}
          {copied === 'report' ? 'Copied' : 'Copy report'}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Opens your email app with the report filled in. Prefer another app?{' '}
        <button
          type="button"
          onClick={() => void copy(SUPPORT_EMAIL, 'email')}
          className="font-mono text-foreground underline-offset-2 hover:underline"
        >
          {copied === 'email' ? 'Address copied' : SUPPORT_EMAIL}
        </button>
      </p>
    </div>
  );
}

export function HelpPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const [query, setQuery] = useState('');
  const status = useHelpStatus(open);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const answers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ANSWERS;
    return ANSWERS.filter((item) =>
      `${item.q} ${item.a}`.toLowerCase().includes(q),
    );
  }, [query]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-panel-title"
        className="rise-in relative flex h-full w-full flex-col border-l border-border bg-background text-foreground shadow-2xl sm:w-[420px]"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" />
            <h2 id="help-panel-title" className="text-sm font-semibold">
              Help & Support
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="flex size-8 items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="flex-1 divide-y divide-border overflow-y-auto">
          <section
            aria-label="Your account right now"
            className="space-y-2.5 px-5 py-4"
          >
            <p className={FIELD_LABEL}>Right now</p>
            {status === null ? (
              <div className="h-9 animate-pulse rounded-[8px] bg-muted" />
            ) : (
              <ul className="divide-y divide-border/60 rounded-[8px] border border-border">
                {status.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={item.text}
                      className="flex items-center gap-2.5 px-3 py-2.5"
                    >
                      <Icon
                        className={`size-4 shrink-0 ${STATUS_TONES[item.tone]}`}
                      />
                      <span className="min-w-0 flex-1 text-xs text-foreground">
                        {item.text}
                      </span>
                      {item.href && item.cta ? (
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-foreground hover:underline"
                        >
                          {item.cta}
                          <ChevronRight className="size-3" />
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section aria-label="Quick answers" className="space-y-2.5 px-5 py-4">
            <p className={FIELD_LABEL}>Quick answers</p>
            <SearchField
              value={query}
              onChange={setQuery}
              label="Search help"
              placeholder="Search answers…"
              className="w-full"
            />
            {answers.length === 0 ? (
              <p className="py-3 text-center font-mono text-[11px] text-muted-foreground">
                No answers match. Ask us below.
              </p>
            ) : (
              <div className="divide-y divide-border/60 rounded-[8px] border border-border">
                {answers.map((item) => (
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/30 [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="space-y-2 px-3 pb-3 text-xs leading-relaxed text-muted-foreground">
                      <p>{item.a}</p>
                      {item.link ? (
                        <Link
                          href={item.link.href}
                          onClick={onClose}
                          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-foreground hover:underline"
                        >
                          {item.link.label}
                          <ChevronRight className="size-3" />
                        </Link>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>

          <section
            aria-label="Contact support"
            className="space-y-2.5 px-5 py-4"
          >
            <div>
              <p className={FIELD_LABEL}>Still stuck?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tell us what happened and we will reply by email.
              </p>
            </div>
            <ContactForm pathname={pathname} />
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-5 py-2.5 font-mono text-[10px] text-muted-foreground">
          <span>
            Press{' '}
            <kbd className="rounded-[5px] border border-border bg-secondary px-1">
              ?
            </kbd>{' '}
            to open help anywhere
          </span>
          <span>
            <kbd className="rounded-[5px] border border-border bg-secondary px-1">
              Esc
            </kbd>{' '}
            to close
          </span>
        </div>
      </aside>
    </div>
  );
}
