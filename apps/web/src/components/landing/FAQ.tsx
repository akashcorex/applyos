'use client';

import { useState } from 'react';

import { ChevronDown } from '@applyso/ui/icons';

import { cn } from '@/lib/utils';

import FaqIcon from './icons/faqicon';

interface FAQItemProps {
  question: string;
  answer: string;
  index: number;
}

function FAQItem({ question, answer }: FAQItemProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div
      className={cn(
        'rounded-lg border-[0.5px] border-neutral-800/50',
        'transition-colors duration-200',
        isOpen
          ? 'bg-linear-to-br via-white/2 from-white/5 via-zinc-50/50 to-white/5'
          : 'hover:bg-white/[0.02]',
      )}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="pressable flex w-full items-center justify-between gap-4 px-2 py-4"
      >
        <h3
          className={cn(
            'text-left text-base font-medium transition-colors duration-200',
            'text-zinc-300',
            isOpen && 'text-white',
          )}
        >
          {question}
        </h3>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform duration-150 ease-out-strong',
            isOpen ? 'rotate-180 text-white' : 'text-zinc-500',
          )}
        />
      </button>
      <div
        data-open={isOpen}
        className={cn(
          'faq-panel',
          isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
      >
        <div className="overflow-hidden">
          <p className="px-2 pb-4 pt-2 text-sm leading-relaxed text-neutral-400">
            {answer}
          </p>
        </div>
      </div>
    </div>
  );
}

function FAQ() {
  const faqs: Omit<FAQItemProps, 'index'>[] = [
    {
      question: 'What is ApplyOS?',
      answer:
        'ApplyOS is an AI job-search copilot. It builds a profile from your resume, finds roles that match, tailors your resume for each one, and submits applications for you — with you in control at every step.',
    },
    {
      question: 'What counts as a submitted application?',
      answer:
        'Only an application that actually goes out. If an application fails, gets stuck, or is cancelled, it does not use your quota. You can watch each one and take over live whenever you want.',
    },
    {
      question: 'How does applying work?',
      answer:
        'You confirm your profile, pick roles from your matches, and ApplyOS fills and submits the forms. Hit a CAPTCHA or an odd form? Take over live, finish it, and ApplyOS resumes after.',
    },
    {
      question: 'Is it free to start?',
      answer:
        'Yes. Every new account gets 25 submitted applications per 30-day cycle, free — discovery, tailored resumes and tracking included. Upgrade when you need more volume.',
    },
    {
      question: 'Which sites do you work on?',
      answer:
        'Startup and company career sites — Greenhouse, Lever, Ashby, Workable, Workday, Wellfound and more — plus a generic mode that handles other application forms. We do not bypass CAPTCHAs anywhere.',
    },
    {
      question: 'Will I get interviews?',
      answer:
        'We cannot promise interviews or jobs — nobody honestly can. We make it faster to apply broadly, with a resume tailored to every role.',
    },
    {
      question: 'Do you write cover letters or follow-up emails?',
      answer:
        'Not yet. Cover letters, follow-up drafts and inbox sync are on our roadmap. We will announce it when they ship — and we never charge for unshipped features.',
    },
    {
      question: 'Is my data private?',
      answer:
        'Your resumes, sessions, and application history stay in your account. We do not sell personal data.',
    },
  ];

  return (
    <section
      id="faq"
      className="bg-linear-to-b w-full scroll-mt-24 from-transparent via-white/[0.02] to-transparent py-24"
    >
      <div className="container mx-auto px-4">
        <div className="mx-auto mb-12 max-w-7xl text-center">
          <FaqIcon />
          <h2 className="mx-auto mb-2 mt-6 max-w-3xl text-balance bg-gradient-to-br from-neutral-100 via-neutral-100 via-50% to-neutral-100/30 bg-clip-text py-2 text-center text-4xl font-medium leading-[1.1] tracking-tighter text-transparent md:text-5xl">
            Let&apos;s Answer Your Questions
          </h2>
          <p className="mb-8 text-balance bg-gradient-to-br from-white/70 via-white/70 to-white/30 bg-clip-text text-center text-[0.8rem] text-transparent sm:text-[0.87rem] lg:text-[1rem]">
            Everything you need to know about our platform
          </p>
        </div>

        <div className="mx-auto max-w-2xl space-y-2">
          {faqs.map((faq, index) => (
            <FAQItem key={index} {...faq} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default FAQ;
