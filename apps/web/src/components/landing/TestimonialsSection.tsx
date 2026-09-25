'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/utils';

import TestimonialIcon from './icons/testimonialicon';

interface Testimonial {
  name: string;
  handle: string;
  initials: string;
  accent: string;
  quote: string;
}

const COLUMNS: Testimonial[][] = [
  [
    {
      name: 'Ananya Sharma',
      handle: '@ananya.builds',
      initials: 'AS',
      accent: 'bg-rose-600',
      quote:
        "I stopped doomscrolling job boards. Matches land in my inbox and applications go out while I'm in lectures.",
    },
    {
      name: 'Rohan Mehta',
      handle: '@rohan.codes',
      initials: 'RM',
      accent: 'bg-amber-600',
      quote:
        'The tailored resume per role is the real unlock. My callback rate tripled in three weeks.',
    },
    {
      name: 'Priya Nair',
      handle: '@priya.designs',
      initials: 'PN',
      accent: 'bg-sky-600',
      quote:
        'Recruiter outreach used to eat my Sundays. Now the drafts are ready and I just approve.',
    },
    {
      name: 'Arjun Patel',
      handle: '@arjun.dev',
      initials: 'AP',
      accent: 'bg-emerald-600',
      quote:
        'Every application tracked in one dashboard. My spreadsheet era is officially over.',
    },
  ],
  [
    {
      name: 'Sneha Reddy',
      handle: '@sneha.ui',
      initials: 'SR',
      accent: 'bg-violet-600',
      quote:
        'Applied to sixty roles during placement season without missing a single class.',
    },
    {
      name: 'Vikram Singh',
      handle: '@vikram.codes',
      initials: 'VS',
      accent: 'bg-orange-600',
      quote: 'It writes like me, not a bot. Hiring managers actually reply.',
    },
    {
      name: 'Ishita Rao',
      handle: '@ishita.builds',
      initials: 'IR',
      accent: 'bg-rose-600',
      quote:
        'Resume in, preferences set, first applications out the same evening. Ten minutes, tops.',
    },
    {
      name: 'Kabir Malhotra',
      handle: '@kabir.dev',
      initials: 'KM',
      accent: 'bg-sky-600',
      quote:
        'The daily digest tells me what moved. No noise, just interviews getting scheduled.',
    },
  ],
  [
    {
      name: 'Divya Menon',
      handle: '@divya.frontend',
      initials: 'DM',
      accent: 'bg-emerald-600',
      quote:
        'I was skeptical about auto-apply. Then three interviews landed in one week.',
    },
    {
      name: 'Aditya Kumar',
      handle: '@aditya.codes',
      initials: 'AK',
      accent: 'bg-violet-600',
      quote:
        'Quiet, consistent, always working in the background. Exactly how a job search should feel.',
    },
    {
      name: 'Neha Gupta',
      handle: '@neha.designs',
      initials: 'NG',
      accent: 'bg-amber-600',
      quote:
        'Switched from manual applying and never looked back. The volume genuinely compounds.',
    },
    {
      name: 'Rahul Verma',
      handle: '@rahul.builds',
      initials: 'RV',
      accent: 'bg-rose-600',
      quote:
        'Every application tracked, every follow-up drafted. I just show up for interviews.',
    },
  ],
];

function TestimonialCard({ testimonial }: { testimonial: Testimonial }) {
  return (
    <figure className="mb-4 rounded-xl border border-neutral-800/60 bg-neutral-950/70 p-5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white',
            testimonial.accent,
          )}
        >
          {testimonial.initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">
            {testimonial.name}
          </p>
          <p className="truncate text-xs text-neutral-500">
            {testimonial.handle}
          </p>
        </div>
      </div>
      <blockquote className="mt-3 text-sm leading-relaxed text-neutral-300">
        {testimonial.quote}
      </blockquote>
    </figure>
  );
}

function TestimonialsSection() {
  return (
    <section id="testimonials" className="w-full scroll-mt-24 py-24">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ transform: 'translateY(8px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="mx-auto mb-12 max-w-7xl text-center"
        >
          <TestimonialIcon />
          <h2 className="mx-auto mb-2 mt-6 max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text py-2 text-center text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl">
            Loved by job seekers
          </h2>
          <p className="mb-8 text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-center text-[0.8rem] text-transparent sm:text-[0.87rem] lg:text-[1rem]">
            Real searches, real interviews, zero spreadsheets
          </p>
        </motion.div>

        <div className="testimonial-mask mx-auto grid max-w-6xl grid-cols-1 gap-4 overflow-hidden sm:grid-cols-2 lg:grid-cols-3 [mask-image:linear-gradient(to_bottom,transparent,black_8%,black_92%,transparent)]">
          {COLUMNS.map((column, columnIndex) => (
            <div
              key={columnIndex}
              className="h-[560px] overflow-hidden md:h-[680px]"
            >
              <div
                className="testimonial-track motion-reduce:animate-none"
                style={{
                  animationDuration: `${52 + columnIndex * 9}s`,
                  animationDirection: columnIndex === 1 ? 'reverse' : 'normal',
                }}
              >
                {[0, 1].map((copy) => (
                  <div key={copy} aria-hidden={copy === 1}>
                    {column.map((testimonial) => (
                      <TestimonialCard
                        key={`${copy}-${testimonial.handle}`}
                        testimonial={testimonial}
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>
        {`
.testimonial-track {
  animation-name: testimonial-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}

.testimonial-mask:hover .testimonial-track {
  animation-play-state: paused;
}

@keyframes testimonial-scroll {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(-50%);
  }
}`}
      </style>
    </section>
  );
}

export default TestimonialsSection;
