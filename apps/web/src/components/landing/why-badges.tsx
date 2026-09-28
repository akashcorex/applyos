'use client';

import { useEffect, useState } from 'react';

import Image from 'next/image';

import { motion } from 'motion/react';

import { CalendarCheck, FilePenLine, Search, Send } from '@applyso/ui/icons';

import { cn } from '@/lib/utils';

import { DataSanitizationPipeline } from './features/data-sanitization-pipeline';
import { SystemEventStream } from './features/system-event-stream';

const ROTATE_MS = 5000;

const BADGES = [
  {
    id: 'scout',
    title: 'Job Scout',
    desc: 'Scans new roles daily and shortlists high-growth matches.',
    stat: '120+ roles scanned daily',
    src: '/badges/job-scout.png',
    width: 765,
    height: 2055,
    alt: 'Job Scout AI agent badge',
    color: 'text-sky-400',
    barColor: 'bg-sky-400',
    Icon: Search,
  },
  {
    id: 'tailor',
    title: 'Resume Tailored',
    desc: 'Rewrites your resume for every role so you pass screening.',
    stat: '3x more callbacks',
    src: '/badges/resume-tailored.png',
    width: 765,
    height: 2056,
    alt: 'Resume Tailored AI agent badge',
    color: 'text-pink-400',
    barColor: 'bg-pink-400',
    Icon: FilePenLine,
  },
  {
    id: 'outreach',
    title: 'Outreach Manager',
    desc: 'Drafts recruiter messages and follows up automatically.',
    stat: '40+ intros per week',
    src: '/badges/outreach-manager.png',
    width: 765,
    height: 2055,
    alt: 'Outreach Manager AI agent badge',
    color: 'text-purple-400',
    barColor: 'bg-purple-400',
    Icon: Send,
  },
  {
    id: 'tracker',
    title: 'Offer Tracker',
    desc: 'Tracks every application and preps you for interviews.',
    stat: '100% of apps tracked',
    src: '/badges/offer-tracker.png',
    width: 765,
    height: 2055,
    alt: 'Offer Tracker AI agent badge',
    color: 'text-amber-400',
    barColor: 'bg-amber-400',
    Icon: CalendarCheck,
  },
];

function slot(index: number, active: number, total: number) {
  const offset = (index - active + total) % total;
  if (offset === 0) return 'is-active';
  if (offset === 1) return 'is-next';
  if (offset === total - 1) return 'is-prev';
  return 'is-hidden';
}

const WhyBadges = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const total = BADGES.length;

  useEffect(() => {
    if (paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % total);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [paused, total]);

  return (
    <section id="why" className="w-full scroll-mt-24 bg-black py-24">
      {/* Section Header */}
      <div className="mx-auto mb-12 max-w-7xl px-4 text-center">
        <motion.div
          initial={{ transform: 'translateY(8px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
        >
          <div className="mb-4 inline-flex max-w-fit items-center gap-2.5 rounded-full border border-neutral-800 bg-neutral-900/80 px-3 py-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
            </span>
            <span className="text-xs font-medium text-neutral-300">
              Why ApplyOS
            </span>
          </div>
          <h2 className="mx-auto max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl">
            Your AI career team
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-[0.95rem] text-transparent md:text-[1.05rem]">
            Four autonomous agents work your job search in parallel while you
            stay focused on classes.
          </p>
        </motion.div>
      </div>

      {/* Bento Grid: Badge Card + 2 Pipeline Components */}
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-stretch gap-6 px-4 lg:grid-cols-12">
        {/* Left Bento: The AI Career Team Showcase Card */}
        <motion.div
          initial={{ transform: 'translateY(12px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="lg:col-span-5"
        >
          <div
            className="dk-why-card relative flex h-full min-h-[540px] w-full flex-col justify-between overflow-hidden rounded-2xl bg-[radial-gradient(130%_100%_at_50%_0%,#5fe3ca_0%,#3ab8a2_45%,#1f6f62_100%)] p-6 sm:min-h-[580px] sm:rounded-3xl sm:p-7"
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          >
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(110%_100%_at_50%_20%,transparent_50%,rgba(0,0,0,0.28)_100%)] sm:rounded-3xl" />

            <div className="pointer-events-none absolute left-6 top-6 z-10 select-none sm:left-8 sm:top-7">
              <p className="text-2xl font-black uppercase leading-[0.92] tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.22)] sm:text-[1.85rem]">
                YOUR AI
                <br />
                CAREER
                <br />
                TEAM
              </p>
            </div>

            <div
              className="dk-why-badges pointer-events-none absolute inset-0"
              role="region"
              aria-roledescription="carousel"
              aria-label="ApplyOS AI career team badges"
            >
              {BADGES.map((badge, index) => (
                <button
                  key={badge.id}
                  type="button"
                  className={cn(
                    'dk-badge pointer-events-auto border-0 bg-transparent',
                    slot(index, active, total),
                  )}
                  onClick={() => setActive(index)}
                  aria-label={`Select ${badge.title}`}
                  aria-hidden={index === active ? undefined : true}
                >
                  <Image
                    className="dk-badge-img bg-transparent"
                    src={badge.src}
                    alt={badge.alt}
                    width={badge.width}
                    height={badge.height}
                    sizes="(max-width: 640px) 184px, 202px"
                    priority={index === 0 || index === 1}
                    unoptimized
                  />
                </button>
              ))}
            </div>

            {/* Interactive Agent Dock */}
            <div className="pointer-events-auto relative z-20 mt-auto flex items-center justify-center pt-8">
              <div className="flex items-center gap-1 rounded-full border border-black/20 bg-black/45 p-1.5 shadow-lg backdrop-blur-md">
                {BADGES.map((badge, index) => (
                  <button
                    key={badge.id}
                    type="button"
                    onClick={() => setActive(index)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-150',
                      active === index
                        ? 'bg-white text-black shadow-sm'
                        : 'text-white/80 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    <badge.Icon className="h-3 w-3" />
                    <span className="hidden text-[11px] sm:inline">
                      {badge.title}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right Bento: The 2 Pipeline Components */}
        <motion.div
          initial={{ transform: 'translateY(12px)', opacity: 0 }}
          whileInView={{ transform: 'translateY(0px)', opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
          viewport={{ once: true }}
          className="flex flex-col justify-between gap-6 lg:col-span-7"
        >
          <DataSanitizationPipeline className="flex-1" />
          <SystemEventStream className="flex-1" />
        </motion.div>
      </div>

      <style>
        {`
.dk-why-card {
  box-shadow: 0 30px 80px -20px rgba(0, 0, 0, 0.6),
              inset 0 1px 1px 0 rgba(255, 255, 255, 0.35);
}

.dk-why-badges {
  perspective: 1200px;
  transform-style: preserve-3d;
}

.dk-badge {
  position: absolute;
  top: -16px;
  left: 50%;
  width: 184px;
  height: 494px;
  margin-left: -92px;
  background: transparent !important;
  border: none !important;
  padding: 0;
  outline: none;
  appearance: none;
  transform-origin: 50% 0%;
  will-change: transform, opacity, filter;
  user-select: none;
  -webkit-user-drag: none;
}

@media (min-width: 640px) {
  .dk-badge {
    top: -20px;
    width: 202px;
    height: 542px;
    margin-left: -101px;
  }
}

.dk-badge-img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  background: transparent !important;
}

/* ACTIVE: Smooth pendulum arrival with soft overshoot, then gentle ambient sway */
.dk-badge.is-active {
  z-index: 30;
  opacity: 1;
  cursor: default;
  animation: badge-arrive 0.9s cubic-bezier(0.16, 1, 0.3, 1) forwards,
             badge-idle-sway 5.5s ease-in-out 0.9s infinite alternate;
}

/* NEXT: Sits behind to the right in the shadow */
.dk-badge.is-next {
  z-index: 20;
  opacity: 0.95;
  cursor: pointer;
  animation: badge-to-next 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dk-badge.is-next:hover {
  transform: translate3d(42px, 6px, 12px) rotate(14deg) scale(0.95);
  filter: drop-shadow(0 20px 30px rgba(0, 0, 0, 0.4)) brightness(0.96);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s ease-out;
}

/* PREV: Silky flick aside as it transitions behind to the left */
.dk-badge.is-prev {
  z-index: 10;
  opacity: 0.9;
  cursor: pointer;
  animation: badge-exit-to-prev 0.85s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.dk-badge.is-prev:hover {
  transform: translate3d(-42px, 6px, -10px) rotate(-14deg) scale(0.95);
  filter: drop-shadow(0 18px 26px rgba(0, 0, 0, 0.35)) brightness(0.92);
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), filter 0.3s ease-out;
}

/* HIDDEN */
.dk-badge.is-hidden {
  transform: translate3d(0, 25px, -60px) scale(0.8);
  opacity: 0;
  z-index: 0;
  pointer-events: none;
  filter: brightness(0.6);
  transition: opacity 0.6s ease, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

/* BUTTERY SMOOTH PENDULUM KEYFRAMES */

@keyframes badge-arrive {
  0% {
    transform: translate3d(38px, 12px, 0px) rotate(13deg) scale(0.92);
    filter: drop-shadow(0 14px 20px rgba(0, 0, 0, 0.3)) brightness(0.86);
  }
  65% {
    /* Smooth, fluid overshoot past center */
    transform: translate3d(-5px, -2px, 42px) rotate(-3.5deg) scale(1.01);
    filter: drop-shadow(0 28px 40px rgba(0, 0, 0, 0.45)) drop-shadow(0 10px 18px rgba(0, 0, 0, 0.28)) brightness(1);
  }
  100% {
    /* Softly settles into rest */
    transform: translate3d(0, 0, 40px) rotate(-1deg) scale(1);
    filter: drop-shadow(0 26px 36px rgba(0, 0, 0, 0.42)) drop-shadow(0 8px 16px rgba(0, 0, 0, 0.25)) brightness(1);
  }
}

@keyframes badge-exit-to-prev {
  0% {
    transform: translate3d(0, 0, 40px) rotate(-1deg) scale(1);
    filter: drop-shadow(0 26px 36px rgba(0, 0, 0, 0.42)) brightness(1);
  }
  35% {
    /* Smooth physical flick aside as released */
    transform: translate3d(-16px, 3px, 20px) rotate(-5.5deg) scale(0.98);
  }
  100% {
    /* Flowing arc into the back-left slot */
    transform: translate3d(-38px, 10px, -20px) rotate(-12deg) scale(0.92);
    filter: drop-shadow(0 16px 24px rgba(0, 0, 0, 0.3)) brightness(0.8);
  }
}

@keyframes badge-to-next {
  0% {
    transform: translate3d(0, 25px, -60px) scale(0.8);
    opacity: 0;
  }
  100% {
    transform: translate3d(38px, 10px, 0px) rotate(12deg) scale(0.92);
    filter: drop-shadow(0 18px 28px rgba(0, 0, 0, 0.35)) brightness(0.86);
    opacity: 0.95;
  }
}

@keyframes badge-idle-sway {
  0% {
    transform: translate3d(0, 0, 40px) rotate(-1deg) scale(1);
  }
  50% {
    transform: translate3d(2.5px, 0.5px, 40px) rotate(0.8deg) scale(1);
  }
  100% {
    transform: translate3d(-2px, -0.5px, 40px) rotate(-1.5deg) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dk-badge,
  .dk-badge.is-active,
  .dk-badge.is-next,
  .dk-badge.is-prev {
    animation: none !important;
    transition: none !important;
  }
}`}
      </style>
    </section>
  );
};

export default WhyBadges;
