'use client';

import {
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
} from 'react';

interface DocumentContent {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  skills: string[];
  education: Array<{ degree: string; school: string; year?: number | null }>;
  work_history: Array<{
    company: string;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    highlights?: string[];
  }>;
  preferred_role?: string | null;
}

interface ResumeDocumentCanvasProps {
  content: DocumentContent;
  skillsText: string;
  onContentChange: (content: DocumentContent) => void;
  onSkillsTextChange: (value: string) => void;
}

const fieldClass =
  'max-w-full rounded-sm border-0 bg-transparent p-0 text-inherit shadow-none outline-none ring-0 placeholder:text-neutral-300 hover:bg-neutral-50 focus:bg-blue-50/80';

function DocText({
  value,
  onChange,
  placeholder,
  ariaLabel,
  multiline = false,
  align = 'left',
  className = '',
  onKeyDown,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel: string;
  multiline?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  onKeyDown?: (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const alignClass =
    align === 'center'
      ? 'text-center'
      : align === 'right'
        ? 'text-right'
        : 'text-left';

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.max(el.scrollHeight, 16)}px`;
  }, [value]);

  if (!multiline) {
    return (
      <input
        aria-label={ariaLabel}
        className={`${fieldClass} ${alignClass} ${className}`}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <textarea
      ref={ref}
      aria-label={ariaLabel}
      className={`${fieldClass} ${alignClass} resize-none overflow-hidden ${className}`}
      placeholder={placeholder}
      rows={1}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

function SectionHeading({ children }: { children: string }) {
  return (
    <div className="mb-2 mt-4">
      <p className="text-[12pt] font-bold uppercase tracking-wide leading-none">
        {children}
      </p>
      <div className="mt-1 h-px w-full bg-neutral-400" />
    </div>
  );
}

export function ResumeDocumentCanvas({
  content,
  skillsText,
  onContentChange,
  onSkillsTextChange,
}: ResumeDocumentCanvasProps) {
  function patchRole(
    index: number,
    patch: Partial<DocumentContent['work_history'][number]>,
  ) {
    const next = content.work_history.map((role, i) =>
      i === index ? { ...role, ...patch } : role,
    );
    onContentChange({ ...content, work_history: next });
  }

  function patchEducation(
    index: number,
    patch: Partial<DocumentContent['education'][number]>,
  ) {
    const next = content.education.map((item, i) =>
      i === index ? { ...item, ...patch } : item,
    );
    onContentChange({ ...content, education: next });
  }

  function setBullet(roleIndex: number, bulletIndex: number, value: string) {
    const role = content.work_history[roleIndex];
    const highlights = [...(role.highlights ?? [])];
    if (highlights.length === 0) highlights.push('');
    highlights[bulletIndex] = value;
    patchRole(roleIndex, { highlights });
  }

  function insertBullet(roleIndex: number, afterIndex: number) {
    const role = content.work_history[roleIndex];
    const highlights = [...(role.highlights?.length ? role.highlights : [''])];
    highlights.splice(afterIndex + 1, 0, '');
    patchRole(roleIndex, { highlights });
  }

  function removeBullet(roleIndex: number, bulletIndex: number) {
    const role = content.work_history[roleIndex];
    const highlights = [...(role.highlights?.length ? role.highlights : [''])];
    if (highlights.length <= 1) {
      highlights[0] = '';
    } else {
      highlights.splice(bulletIndex, 1);
    }
    patchRole(roleIndex, { highlights });
  }

  return (
    <div className="rounded-sm bg-neutral-200 px-3 py-4 sm:px-6">
      <p className="mb-3 text-center text-xs text-neutral-500">
        Click any text to edit. Layout stays the same.
      </p>
      <article
        className="mx-auto min-h-[11in] w-full max-w-[8.5in] bg-white px-[18mm] py-[16mm] text-neutral-900 shadow-lg"
        style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}
      >
        <header className="mb-3 space-y-0.5 text-center">
          <DocText
            ariaLabel="Full name"
            className="w-full text-[16pt] font-bold leading-tight"
            placeholder="Full name"
            align="center"
            value={content.full_name}
            onChange={(full_name) => onContentChange({ ...content, full_name })}
          />
          <div className="flex flex-wrap items-baseline justify-center gap-x-1 text-[10pt] leading-[14px]">
            <DocText
              ariaLabel="Email"
              className="w-auto min-w-[8rem] max-w-[22rem] flex-none"
              placeholder="Email"
              align="center"
              value={content.email}
              onChange={(email) => onContentChange({ ...content, email })}
            />
            <span className="text-neutral-400">|</span>
            <DocText
              ariaLabel="Phone"
              className="w-auto min-w-[7rem] max-w-[12rem] flex-none"
              placeholder="Phone"
              align="center"
              value={content.phone ?? ''}
              onChange={(phone) =>
                onContentChange({ ...content, phone: phone || null })
              }
            />
            <span className="text-neutral-400">|</span>
            <DocText
              ariaLabel="Location"
              className="w-auto min-w-[7rem] max-w-[14rem] flex-none"
              placeholder="Location"
              align="center"
              value={content.location ?? ''}
              onChange={(location) =>
                onContentChange({ ...content, location: location || null })
              }
            />
          </div>
          <DocText
            ariaLabel="Target role"
            className="w-full text-[10pt] italic leading-[14px]"
            placeholder="Target role"
            align="center"
            value={content.preferred_role ?? ''}
            onChange={(preferred_role) =>
              onContentChange({
                ...content,
                preferred_role: preferred_role || null,
              })
            }
          />
        </header>

        <section>
          <SectionHeading>Summary</SectionHeading>
          <DocText
            ariaLabel="Summary"
            multiline
            className="w-full text-[10pt] leading-[14px]"
            placeholder="Professional summary"
            value={content.summary ?? ''}
            onChange={(summary) =>
              onContentChange({ ...content, summary: summary || null })
            }
          />
        </section>

        <section>
          <SectionHeading>Skills</SectionHeading>
          <DocText
            ariaLabel="Skills"
            multiline
            className="w-full text-[10pt] leading-[14px]"
            placeholder="Skill one, skill two, skill three"
            value={skillsText}
            onChange={onSkillsTextChange}
          />
        </section>

        {content.work_history.length > 0 ? (
          <section>
            <SectionHeading>Experience</SectionHeading>
            <div className="space-y-3">
              {content.work_history.map((role, roleIndex) => {
                const bullets =
                  role.highlights && role.highlights.length > 0
                    ? role.highlights
                    : [''];
                return (
                  <div key={`${role.company}-${role.title}-${roleIndex}`}>
                    <div className="flex items-baseline gap-2 text-[10pt] leading-[14px]">
                      <div className="flex min-w-0 flex-1 items-baseline gap-1 font-bold">
                        <DocText
                          ariaLabel={`Job title ${roleIndex + 1}`}
                          className="min-w-0 flex-1 font-bold"
                          placeholder="Title"
                          value={role.title}
                          onChange={(title) => patchRole(roleIndex, { title })}
                        />
                        <span className="shrink-0 font-bold">—</span>
                        <DocText
                          ariaLabel={`Company ${roleIndex + 1}`}
                          className="min-w-0 flex-1 font-bold"
                          placeholder="Company"
                          value={role.company}
                          onChange={(company) =>
                            patchRole(roleIndex, { company })
                          }
                        />
                      </div>
                      <div className="flex w-[9.5rem] shrink-0 items-baseline gap-1 text-[9pt] italic text-neutral-700">
                        <DocText
                          ariaLabel={`Start date ${roleIndex + 1}`}
                          align="right"
                          className="min-w-0 flex-1 italic"
                          placeholder="Start"
                          value={role.start_date ?? ''}
                          onChange={(start_date) =>
                            patchRole(roleIndex, {
                              start_date: start_date || null,
                            })
                          }
                        />
                        <span className="shrink-0">–</span>
                        <DocText
                          ariaLabel={`End date ${roleIndex + 1}`}
                          className="min-w-0 flex-1 italic"
                          placeholder="End"
                          value={role.end_date ?? ''}
                          onChange={(end_date) =>
                            patchRole(roleIndex, {
                              end_date: end_date || null,
                            })
                          }
                        />
                      </div>
                    </div>
                    <ul className="mt-0.5">
                      {bullets.map((bullet, bulletIndex) => (
                        <li
                          key={`${roleIndex}-${bulletIndex}`}
                          className="flex items-start gap-2 text-[10pt] leading-[14px]"
                        >
                          <span className="mt-[1px] shrink-0 select-none">
                            –
                          </span>
                          <DocText
                            ariaLabel={`Bullet ${bulletIndex + 1} for ${role.title}`}
                            multiline
                            className="min-w-0 flex-1"
                            placeholder="Impact or responsibility"
                            value={bullet}
                            onChange={(value) =>
                              setBullet(roleIndex, bulletIndex, value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                insertBullet(roleIndex, bulletIndex);
                              }
                              if (
                                event.key === 'Backspace' &&
                                bullet === '' &&
                                bullets.length > 0
                              ) {
                                event.preventDefault();
                                removeBullet(roleIndex, bulletIndex);
                              }
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {content.education.length > 0 ? (
          <section>
            <SectionHeading>Education</SectionHeading>
            <div className="space-y-1">
              {content.education.map((item, index) => (
                <div
                  key={`${item.school}-${item.degree}-${index}`}
                  className="flex flex-wrap items-baseline gap-1 text-[10pt] leading-[14px]"
                >
                  <DocText
                    ariaLabel={`Degree ${index + 1}`}
                    className="w-auto min-w-[8rem] max-w-[18rem] flex-none"
                    placeholder="Degree"
                    value={item.degree}
                    onChange={(degree) => patchEducation(index, { degree })}
                  />
                  <span className="text-neutral-500">,</span>
                  <DocText
                    ariaLabel={`School ${index + 1}`}
                    className="min-w-0 flex-1"
                    placeholder="School"
                    value={item.school}
                    onChange={(school) => patchEducation(index, { school })}
                  />
                  <span className="text-neutral-500">(</span>
                  <DocText
                    ariaLabel={`Graduation year ${index + 1}`}
                    className="w-14 flex-none"
                    placeholder="Year"
                    value={item.year != null ? String(item.year) : ''}
                    onChange={(raw) => {
                      const digits = raw.replace(/\D/g, '').slice(0, 4);
                      patchEducation(index, {
                        year: digits ? Number(digits) : null,
                      });
                    }}
                  />
                  <span className="text-neutral-500">)</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </article>
    </div>
  );
}
