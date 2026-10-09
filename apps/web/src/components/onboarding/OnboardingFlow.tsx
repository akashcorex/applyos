'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import Image from 'next/image';
import { useRouter } from 'next/navigation';

import { motion, AnimatePresence, useReducedMotion } from 'motion/react';

import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from '@applyso/ui/icons';

interface ParseResult {
  resume_id: string;
  resume_file_id: string;
  full_name: string;
  email: string;
  location: string | null;
  skills: string[];
  education: Record<string, unknown>[];
  work_history: Record<string, unknown>[];
  experience_years: number;
  total_experience_years: number | null;
  preferred_role: string | null;
  file_name: string;
}

type Step = 'upload' | 'processing' | 'review' | 'success';

interface ReviewDraft {
  fullName: string;
  role: string;
  location: string;
  skills: string;
}

interface Summary {
  firstName: string;
  role: string | null;
  skillsCount: number;
  expYears: number | null;
  positions: number;
  fileName: string;
}

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = ['.pdf', '.docx'];
const STAGES = ['Uploading', 'Reading your resume', 'Building your profile'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function firstNameOf(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? '';
  return first || 'there';
}

const easeOut = [0.23, 1, 0.32, 1] as const;

function enterVariants(reduce: boolean) {
  return {
    hidden: reduce
      ? { opacity: 0 }
      : { opacity: 0, transform: 'translateY(8px)' },
    visible: { opacity: 1, transform: 'none' },
  };
}

export function OnboardingFlow() {
  const router = useRouter();
  const reduceMotion = useReducedMotion() ?? false;
  const containerVariants = enterVariants(reduceMotion);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressValue = useRef(0);

  const [step, setStep] = useState<Step>('upload');
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stageIndex, setStageIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [reviewDraft, setReviewDraft] = useState<ReviewDraft>({
    fullName: '',
    role: '',
    location: '',
    skills: '',
  });
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    router.prefetch('/dashboard');
    router.prefetch('/dashboard/profile');
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, [router]);

  const stopProgress = useCallback(() => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
      progressTimer.current = null;
    }
  }, []);

  const startProgress = useCallback(() => {
    stopProgress();
    progressValue.current = 4;
    setProgress(4);
    setStageIndex(0);
    progressTimer.current = setInterval(() => {
      const current = progressValue.current;
      const next = Math.min(
        current < 30
          ? current + 3
          : current < 70
            ? current + 1.2
            : current + 0.4,
        92,
      );
      progressValue.current = next;
      setProgress(next);
      setStageIndex(next > 55 ? 2 : next > 20 ? 1 : 0);
    }, 220);
  }, [stopProgress]);

  const confirmProfile = useCallback(
    async (draft: ReviewDraft, source: ParseResult) => {
      setConfirming(true);
      setConfirmError(null);
      try {
        const save = await fetch('/api/profiles', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: draft.fullName.trim(),
            email: source.email,
            location: draft.location.trim() || null,
            skills: draft.skills
              .split(',')
              .map((skill) => skill.trim())
              .filter(Boolean),
            preferredRoles: draft.role.trim() ? [draft.role.trim()] : [],
          }),
        });
        if (!save.ok) {
          const data = (await save.json().catch(() => ({}))) as {
            error?: string;
          };
          setConfirmError(
            data.error ?? 'Could not save your profile. Try again.',
          );
          return false;
        }

        const res = await fetch('/api/profiles/confirm', { method: 'POST' });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          setConfirmError(data.error ?? 'Could not finish setup. Try again.');
          return false;
        }
        return true;
      } catch {
        setConfirmError('Profile service is unavailable. Try again.');
        return false;
      } finally {
        setConfirming(false);
      }
    },
    [],
  );

  const goDashboard = useCallback(() => {
    redirectTimer.current = setTimeout(() => {
      router.replace('/dashboard');
    }, 1600);
  }, [router]);

  async function handleFile(file: File) {
    const lower = file.name.toLowerCase();
    const okExt = ACCEPTED.some((ext) => lower.endsWith(ext));
    if (!okExt) {
      setError('Please upload a PDF or DOCX file.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That file is over 50MB. Please upload a smaller resume.');
      return;
    }

    setError(null);
    setConfirmError(null);
    setFileName(file.name);
    setFileSize(formatBytes(file.size));
    setStep('processing');
    startProgress();

    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/resume/parse', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as ParseResult & {
        error?: string;
      };
      if (!res.ok) {
        stopProgress();
        setStep('upload');
        setError(data.error ?? 'Resume processing failed. Please try again.');
        return;
      }

      stopProgress();
      progressValue.current = 100;
      setProgress(100);
      setParsed(data);
      setReviewDraft({
        fullName: data.full_name,
        role: data.preferred_role ?? '',
        location: data.location ?? '',
        skills: data.skills.join(', '),
      });
      setStep('review');
    } catch {
      stopProgress();
      setStep('upload');
      setError('Resume service is unreachable. Please try again.');
    }
  }

  async function handleConfirm() {
    if (!parsed) return;
    const ok = await confirmProfile(reviewDraft, parsed);
    if (!ok) return;

    setSummary({
      firstName: firstNameOf(reviewDraft.fullName),
      role: reviewDraft.role || null,
      skillsCount: reviewDraft.skills
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean).length,
      expYears:
        parsed.total_experience_years ?? parsed.experience_years ?? null,
      positions: parsed.work_history.length,
      fileName: parsed.file_name || fileName || 'your resume',
    });
    setStep('success');
    goDashboard();
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  }

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 sm:p-10 relative overflow-hidden">
      {/* ambient radial glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_500px_at_50%_10%,rgba(59,130,246,0.12),transparent)]"
      />

      <div className="w-full max-w-xl relative z-10">
        {/* brand header */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          transition={{ duration: 0.25, ease: easeOut }}
          className="flex items-center justify-center gap-2.5 mb-8"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-900 border border-white/10 shadow-md">
            <Image
              src="/logo-white.png"
              alt="ApplyOS"
              width={16}
              height={16}
              className="h-4 w-auto object-contain"
            />
          </span>
          <span className="text-sm font-bold text-white tracking-[0.15em] uppercase">
            ApplyOS.in
          </span>
        </motion.div>

        {/* stepper */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          transition={{ duration: 0.25, delay: 0.05, ease: easeOut }}
          className="space-y-3 mb-6"
        >
          {/* step 1 — completed */}
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  Account Created
                </p>
                <p className="text-xs text-neutral-400">
                  Signed in and ready to set up
                </p>
              </div>
            </div>
          </div>

          {/* step 2 — active (upload / processing / verified) */}
          <div
            className={`relative overflow-hidden rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 ${
              step === 'upload'
                ? 'border-blue-500/30 bg-blue-500/[0.06] shadow-[0_0_40px_-16px_rgba(59,130,246,0.35)]'
                : step === 'processing' || step === 'review'
                  ? 'border-blue-500/40 bg-blue-500/[0.08] shadow-[0_0_50px_-12px_rgba(59,130,246,0.45)]'
                  : 'border-emerald-500/20 bg-emerald-500/[0.04]'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                  step === 'upload'
                    ? 'bg-blue-500/15 text-blue-400'
                    : step === 'processing' || step === 'review'
                      ? 'bg-blue-500/20 text-blue-300'
                      : 'bg-emerald-500/15 text-emerald-400'
                }`}
              >
                {step === 'processing' ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : step === 'success' ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <FileText className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-white">
                  {step === 'upload'
                    ? 'Upload Resume'
                    : step === 'processing'
                      ? 'Verifying Details'
                      : step === 'review'
                        ? 'Review Profile'
                        : 'Details Verified'}
                </p>
                <p className="text-xs text-neutral-400">
                  {step === 'upload'
                    ? 'Add your resume so we can build your profile'
                    : step === 'processing'
                      ? STAGES[stageIndex]
                      : step === 'review'
                        ? 'Check the extracted details before confirming'
                        : 'Profile built from your resume'}
                </p>
              </div>
              {step === 'processing' ? (
                <span className="text-xs font-semibold text-blue-400">
                  {Math.round(progress)}%
                </span>
              ) : null}
            </div>

            {step === 'processing' ? (
              <div className="mt-4">
                <div
                  className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round(progress)}%` }}
                    transition={{ duration: 0.2 }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* step 3 — pending / active */}
          <div
            className={`relative overflow-hidden rounded-2xl border p-4 transition-[border-color,background-color,box-shadow] duration-200 ${
              step === 'success'
                ? 'border-emerald-500/20 bg-emerald-500/[0.04] shadow-[0_0_40px_-16px_rgba(16,185,129,0.25)]'
                : 'border-white/[0.05] bg-white/[0.02] opacity-60'
            }`}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${
                  step === 'success'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'border border-white/10 bg-white/5 text-neutral-500'
                }`}
              >
                {step === 'success' ? (
                  <Sparkles className="h-5 w-5" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1">
                <p
                  className={`text-sm font-semibold transition-colors duration-300 ${step === 'success' ? 'text-white' : 'text-neutral-300'}`}
                >
                  Welcome Aboard
                </p>
                <p className="text-xs text-neutral-400">
                  {step === 'success'
                    ? 'Redirecting to your dashboard…'
                    : 'Final step after verification'}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* main interaction card */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          transition={{ duration: 0.25, delay: 0.05, ease: easeOut }}
          className="rounded-3xl border border-white/[0.08] bg-neutral-950/80 backdrop-blur-sm p-6 sm:p-8"
        >
          <AnimatePresence mode="wait">
            {step === 'upload' ? (
              <motion.div
                key="upload"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, transform: 'translateY(8px)' }
                }
                animate={{ opacity: 1, transform: 'none' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: easeOut }}
                className="text-center"
              >
                <div
                  role="button"
                  tabIndex={0}
                  aria-label="Upload your resume"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      inputRef.current?.click();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    const file = e.dataTransfer.files?.[0];
                    if (file) void handleFile(file);
                  }}
                  onClick={() => inputRef.current?.click()}
                  className={`group pressable rounded-2xl border-2 border-dashed p-8 sm:p-10 flex flex-col items-center justify-center gap-3 text-center cursor-pointer transition-[border-color,background-color] duration-200 ${
                    dragging
                      ? 'border-blue-400 bg-blue-500/[0.06] scale-[1.01]'
                      : 'border-white/10 bg-white/[0.02] hover:border-blue-400/60 hover:bg-blue-500/[0.04]'
                  }`}
                >
                  <span className="fine-hover-scale h-14 w-14 rounded-full bg-blue-500/15 text-blue-400 flex items-center justify-center shadow-[0_0_24px_-8px_rgba(59,130,246,0.35)] transition-transform duration-150 ease-out-strong">
                    <UploadCloud className="h-7 w-7" />
                  </span>
                  <p className="text-base sm:text-lg font-semibold text-white">
                    Drag & drop your resume
                  </p>
                  <p className="text-sm text-neutral-400">
                    or click to browse files
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-1">
                    {['PDF', 'DOCX', '50MB MAX'].map((pill) => (
                      <span
                        key={pill}
                        className="rounded-full bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-300"
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx"
                    className="hidden"
                    onChange={onInputChange}
                  />
                </div>

                {error ? (
                  <motion.div
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, transform: 'translateY(8px)' }
                    }
                    animate={{ opacity: 1, transform: 'none' }}
                    transition={{ duration: 0.25, ease: easeOut }}
                    className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 font-medium flex items-start justify-between gap-3"
                  >
                    <span>{error}</span>
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="shrink-0 font-bold underline underline-offset-2 hover:text-red-100"
                    >
                      Retry
                    </button>
                  </motion.div>
                ) : null}

                <ul className="mt-6 space-y-3 text-sm font-medium text-neutral-300 text-left">
                  {[
                    'Auto-extracts your role, skills & experience',
                    'Wrong details? Fix them anytime in Settings',
                    'One upload, about a minute — then you’re in',
                  ].map((line) => (
                    <li key={line} className="flex items-start gap-3">
                      <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-400 shrink-0" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-6 text-center text-[11px] text-neutral-500 font-medium">
                  Your resume is only used to build your profile.
                </p>
              </motion.div>
            ) : null}

            {step === 'review' && parsed ? (
              <motion.form
                key="review"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, transform: 'translateY(8px)' }
                }
                animate={{ opacity: 1, transform: 'none' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: easeOut }}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleConfirm();
                }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Review your extracted profile
                  </h2>
                  <p className="mt-1 text-sm text-neutral-400">
                    Make corrections before ApplyOS saves and confirms it.
                  </p>
                </div>
                {(
                  [
                    ['fullName', 'Full name'],
                    ['role', 'Target role'],
                    ['location', 'Location'],
                    ['skills', 'Skills'],
                  ] as const
                ).map(([field, label]) => (
                  <label
                    key={field}
                    className="block text-left text-xs font-semibold text-neutral-300"
                  >
                    {label}
                    <input
                      required={field === 'fullName'}
                      value={reviewDraft[field]}
                      onChange={(event) =>
                        setReviewDraft((draft) => ({
                          ...draft,
                          [field]: event.target.value,
                        }))
                      }
                      className="mt-1 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-sm text-white outline-none focus:border-blue-400"
                    />
                  </label>
                ))}
                <p className="-mt-2 text-left text-xs text-neutral-500">
                  Separate skills with commas.
                </p>
                {confirmError ? (
                  <p className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-left text-xs text-red-200">
                    {confirmError}
                  </p>
                ) : null}
                <button
                  type="submit"
                  disabled={confirming}
                  className="pressable flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
                >
                  {confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {confirming ? 'Saving profile…' : 'Confirm profile'}
                  {!confirming ? <ArrowRight className="h-4 w-4" /> : null}
                </button>
              </motion.form>
            ) : null}

            {step === 'processing' ? (
              <motion.div
                key="processing"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, transform: 'translateY(8px)' }
                }
                animate={{ opacity: 1, transform: 'none' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: easeOut }}
                className="text-center py-6"
              >
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 shadow-[0_0_40px_-12px_rgba(59,130,246,0.4)]">
                  <Loader2 className="h-9 w-9 animate-spin" />
                </div>
                <p className="text-lg font-semibold text-white">
                  {STAGES[stageIndex]}
                </p>
                <p className="mt-1 text-sm text-neutral-400">
                  {fileName} · {fileSize}
                </p>
                <p className="mt-5 text-xs text-neutral-500">
                  Keep this tab open — usually under a minute.
                </p>

                {error ? (
                  <motion.div
                    initial={
                      reduceMotion
                        ? { opacity: 0 }
                        : { opacity: 0, transform: 'translateY(8px)' }
                    }
                    animate={{ opacity: 1, transform: 'none' }}
                    transition={{ duration: 0.25, ease: easeOut }}
                    className="mt-5 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 font-medium"
                  >
                    {error}{' '}
                    <button
                      type="button"
                      onClick={() => inputRef.current?.click()}
                      className="font-bold underline underline-offset-2 hover:text-red-100"
                    >
                      Retry
                    </button>
                  </motion.div>
                ) : null}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.docx"
                  className="hidden"
                  onChange={onInputChange}
                />
              </motion.div>
            ) : null}

            {step === 'success' && summary ? (
              <motion.div
                key="success"
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, transform: 'scale(0.98)' }
                }
                animate={{ opacity: 1, transform: 'none' }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: easeOut }}
                className="text-center py-2"
              >
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 shadow-[0_0_40px_-12px_rgba(16,185,129,0.35)]">
                  {confirming ? (
                    <Loader2 className="h-9 w-9 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-9 w-9" />
                  )}
                </div>
                <h2 className="mt-5 text-xl sm:text-2xl font-bold tracking-tight">
                  Welcome
                  {summary.firstName !== 'there'
                    ? `, ${summary.firstName}`
                    : ''}
                  !
                </h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Profile built from{' '}
                  <span className="font-semibold text-neutral-200">
                    {summary.fileName}
                  </span>
                  .
                </p>

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  {summary.role ? (
                    <span className="rounded-full bg-blue-500/15 text-blue-300 px-3.5 py-1.5 text-xs font-semibold">
                      {summary.role}
                    </span>
                  ) : null}
                  {summary.expYears !== null ? (
                    <span className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-neutral-300">
                      {summary.expYears} yr{summary.expYears === 1 ? '' : 's'}{' '}
                      exp
                    </span>
                  ) : null}
                  {summary.skillsCount > 0 ? (
                    <span className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-neutral-300">
                      {summary.skillsCount} skills
                    </span>
                  ) : null}
                  {summary.positions > 0 ? (
                    <span className="rounded-full bg-white/[0.06] px-3.5 py-1.5 text-xs font-semibold text-neutral-300">
                      {summary.positions} role
                      {summary.positions === 1 ? '' : 's'}
                    </span>
                  ) : null}
                </div>

                {confirmError ? (
                  <div className="mt-5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 font-medium">
                    {confirmError}{' '}
                    <button
                      type="button"
                      onClick={() =>
                        parsed &&
                        void confirmProfile(reviewDraft, parsed).then((ok) => {
                          if (ok) {
                            setConfirmError(null);
                            goDashboard();
                          }
                        })
                      }
                      disabled={confirming}
                      className="font-bold underline underline-offset-2 disabled:opacity-50"
                    >
                      {confirming ? 'Retrying…' : 'Retry'}
                    </button>
                  </div>
                ) : (
                  <p className="mt-5 text-xs text-neutral-400 flex items-center justify-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Taking you to your dashboard…
                  </p>
                )}

                <div className="mt-6 flex flex-col sm:flex-row gap-3">
                  <button
                    type="button"
                    onClick={() => router.replace('/dashboard')}
                    className="pressable flex-1 bg-white hover:bg-neutral-200 text-black font-semibold text-sm py-3 rounded-xl shadow-sm flex items-center justify-center gap-2"
                  >
                    Continue to dashboard
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <a
                    href="/dashboard/profile"
                    className="pressable sm:w-auto px-5 bg-transparent border border-white/10 hover:bg-white/[0.04] text-white font-semibold text-sm py-3 rounded-xl flex items-center justify-center gap-2"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Review profile
                  </a>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </motion.div>

        {/* footer tagline */}
        <motion.div
          initial="hidden"
          animate="visible"
          variants={containerVariants}
          transition={{ duration: 0.25, delay: 0.08, ease: easeOut }}
          className="mt-10 text-center"
        ></motion.div>
      </div>
    </main>
  );
}
