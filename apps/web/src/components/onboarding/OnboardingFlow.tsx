'use client';

import { useRef, useState } from 'react';

import { useRouter } from 'next/navigation';

import {
  CheckCircle2,
  FileText,
  Loader2,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';

interface ParseResult {
  resume_id: string;
  resume_file_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  summary: string | null;
  skills: string[];
  education: Record<string, unknown>[];
  work_history: Record<string, unknown>[];
  preferred_role: string | null;
  file_name: string;
}

type Step = 'upload' | 'review' | 'confirmed';

export function OnboardingFlow() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    setFileName(file.name);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/resume/parse', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as ParseResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Resume processing failed. Please try again.');
        setFileName(null);
        return;
      }
      setParsed(data);
      setStep('review');
    } catch {
      setError('Resume service is unreachable. Please try again.');
      setFileName(null);
    } finally {
      setUploading(false);
    }
  }

  function onInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) void handleFile(file);
    event.target.value = '';
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    if (uploading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch('/api/profiles/confirm', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Could not confirm your profile.');
        setConfirming(false);
        return;
      }
      setStep('confirmed');
      router.replace('/dashboard');
    } catch {
      setError('Profile service is unavailable. Please try again.');
      setConfirming(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-9 w-9 rounded-md bg-white p-2 shadow-md flex items-center justify-center">
            <img
              src="/logo-white.png"
              alt="ApplyOS"
              className="h-4 w-auto object-contain"
            />
          </div>
        </div>

        <ol className="flex items-center justify-center gap-3 mb-6 text-[11px] font-bold uppercase tracking-wider">
          {[
            { key: 'upload', label: '1. Upload resume' },
            { key: 'review', label: '2. Confirm profile' },
            { key: 'confirmed', label: '3. Done' },
          ].map((item) => (
            <li
              key={item.key}
              className={item.key === step ? 'text-white' : 'text-slate-500'}
            >
              {item.label}
            </li>
          ))}
        </ol>

        <div className="rounded-2xl bg-white text-slate-900 p-6 sm:p-8 shadow-2xl">
          {step === 'upload' ? (
            <>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                Upload your resume
              </h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6 font-medium">
                We extract your profile from it — that&apos;s the only thing we
                need to get you started.
              </p>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                onClick={() => !uploading && inputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all duration-150"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    <p className="text-xs font-semibold text-slate-500">
                      Extracting your profile from{' '}
                      <span className="text-slate-900">{fileName}</span>…
                    </p>
                    <p className="text-[11px] text-slate-400">
                      This usually takes under a minute.
                    </p>
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-8 w-8 text-slate-400" />
                    <p className="text-xs font-semibold text-slate-600">
                      Drop your resume here or click to browse
                    </p>
                    <p className="text-[11px] text-slate-400">
                      PDF or DOCX, up to 50MB
                    </p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,.doc,.docx"
                  className="hidden"
                  onChange={onInputChange}
                  disabled={uploading}
                />
              </div>
            </>
          ) : null}

          {step === 'review' && parsed ? (
            <>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase">
                  Profile extracted
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1 mb-6 font-medium">
                Review what we pulled from{' '}
                <span className="font-bold text-slate-700">
                  {parsed.file_name}
                </span>
                . You can edit every detail in Settings afterwards.
              </p>

              <dl className="space-y-3 text-xs mb-6">
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                    Name
                  </dt>
                  <dd className="text-slate-900 font-medium">
                    {parsed.full_name || '—'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                    Email
                  </dt>
                  <dd className="text-slate-900 font-medium break-all">
                    {parsed.email || '—'}
                  </dd>
                </div>
                {parsed.preferred_role ? (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                      Headline
                    </dt>
                    <dd className="text-slate-900 font-medium">
                      {parsed.preferred_role}
                    </dd>
                  </div>
                ) : null}
                {parsed.location ? (
                  <div className="flex gap-2">
                    <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                      Location
                    </dt>
                    <dd className="text-slate-900 font-medium">
                      {parsed.location}
                    </dd>
                  </div>
                ) : null}
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                    Skills
                  </dt>
                  <dd className="text-slate-900 font-medium">
                    {parsed.skills.length > 0
                      ? parsed.skills.slice(0, 12).join(', ') +
                        (parsed.skills.length > 12
                          ? ` +${parsed.skills.length - 12} more`
                          : '')
                      : '—'}
                  </dd>
                </div>
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 font-bold text-slate-500 uppercase tracking-wide">
                    Experience
                  </dt>
                  <dd className="text-slate-900 font-medium">
                    {parsed.work_history.length} position
                    {parsed.work_history.length === 1 ? '' : 's'}
                    {' · '}
                    {parsed.education.length} education entr
                    {parsed.education.length === 1 ? 'y' : 'ies'}
                  </dd>
                </div>
              </dl>

              {error ? (
                <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
                  {error}
                </div>
              ) : (
                <p className="mb-4 text-[11px] leading-relaxed text-slate-400 font-medium">
                  Confirming locks this profile — future resume uploads
                  won&apos;t overwrite it. You can always edit details in
                  Settings.
                </p>
              )}

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="flex-1 bg-slate-950 hover:bg-slate-900 text-white font-semibold text-xs py-2.5 rounded-md shadow-sm transition-all duration-150 tactile-btn disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {confirming ? (
                    <Loader2 className="h-4 w-4 animate-spin text-white" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>
                    {confirming ? 'Confirming...' : 'Confirm & continue'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParsed(null);
                    setFileName(null);
                    setError(null);
                    setStep('upload');
                  }}
                  disabled={confirming}
                  className="sm:w-auto px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-800 font-semibold text-xs py-2.5 rounded-md shadow-sm transition-all duration-150 tactile-btn flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span>Use a different file</span>
                </button>
              </div>
            </>
          ) : null}

          {error && step === 'upload' ? (
            <div className="mt-4 p-3 rounded-md bg-red-50 border border-red-200 text-xs text-red-600 font-medium">
              {error}
            </div>
          ) : null}

          <p className="mt-5 text-center text-[11px] text-slate-400 font-medium flex items-center justify-center gap-1.5">
            <FileText className="h-3 w-3" />
            Your resume is only used to build your profile.
          </p>
        </div>
      </div>
    </main>
  );
}
