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
        'ApplyOS is an AI agent that finds high-growth roles, tailors your resume, applies for you, and reaches out to recruiters so you can keep studying.',
    },
    {
      question: 'How does auto-apply work?',
      answer:
        'You upload a resume and set preferences. The agent discovers matching jobs, customizes materials for each role, and submits applications on your behalf.',
    },
    {
      question: 'Will applications sound like me?',
      answer:
        'Yes. Outreach and resume edits are generated from your profile and writing. You can review them or let the agent send automatically.',
    },
    {
      question: 'Is it free to start?',
      answer:
        'Yes. You can start for free, connect your accounts, and apply to roles before upgrading.',
    },
    {
      question: 'Do I need to stay at my computer?',
      answer:
        'No. Once a run is going, the agent works in the background. Check status from the dashboard anytime.',
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
