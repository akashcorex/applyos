'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

interface Limit {
  title: string;
  tag: string;
  tone: 'later' | 'never' | 'beta';
  body: string;
}

const LIMITS: Limit[] = [
  {
    title: 'Cover letters',
    tag: 'Not yet',
    tone: 'later',
    body: 'Every application ships with a tailored resume. Cover letters are on the roadmap — we will announce it when they land.',
  },
  {
    title: 'Follow-ups & inbox sync',
    tag: 'Not yet',
    tone: 'later',
    body: 'We do not draft follow-up emails or sync replies yet. When it ships, we will say so — we never charge for unshipped features.',
  },
  {
    title: 'CAPTCHA bypassing',
    tag: 'Never',
    tone: 'never',
    body: 'If a site throws a CAPTCHA or an odd form, you take over live, finish it, and ApplyOS resumes after. We do not bypass.',
  },
  {
    title: 'Interview guarantees',
    tag: 'Never',
    tone: 'never',
    body: 'Nobody can honestly promise interviews or jobs. We make applying faster and tailored — the outcome stays yours.',
  },
  {
    title: 'Spray-and-pray volume',
    tag: 'Never',
    tone: 'never',
    body: 'We only apply to roles that clear your match threshold, at a human pace. Blind 500-a-day blasting is not the product.',
  },
  {
    title: 'Beta label',
    tag: 'Status',
    tone: 'beta',
    body: 'ApplyOS is in beta. Things break and we fix them weekly. Tell us what is broken — it ships faster that way.',
  },
];

const toneStyles: Record<Limit['tone'], string> = {
  later: 'border-neutral-700 text-neutral-300',
  never: 'border-neutral-600 text-white',
  beta: 'border-neutral-800 text-neutral-400',
};

function HonestLimitsSection() {
  return (
    <section id="limits" className="w-full scroll-mt-24 py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ transform: 'translateY(8px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="mx-auto mb-12 max-w-7xl text-center"
        >
          <div className="mb-4 inline-flex max-w-fit items-center gap-2.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
            <span className="text-xs font-medium text-neutral-300">
              Honest limits
            </span>
          </div>
          <h2 className="mx-auto mb-2 mt-6 max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text py-2 text-center text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl">
            What we don&apos;t do (yet)
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-center text-[0.8rem] text-transparent sm:text-[0.87rem] lg:text-[1rem]">
            No fake testimonials here — just the line, drawn clearly.
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-6xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIMITS.map((limit, index) => (
            <motion.div
              key={limit.title}
              initial={{ transform: 'translateY(8px)', opacity: 0 }}
              whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
              transition={{
                duration: 0.4,
                delay: 0.05 * index,
                ease: [0.23, 1, 0.32, 1],
              }}
              viewport={{ once: true }}
              className="rounded-2xl border border-neutral-800/60 bg-neutral-950/40 p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white">
                  {limit.title}
                </h3>
                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                    toneStyles[limit.tone],
                  )}
                >
                  {limit.tag}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-neutral-400">
                {limit.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default HonestLimitsSection;
