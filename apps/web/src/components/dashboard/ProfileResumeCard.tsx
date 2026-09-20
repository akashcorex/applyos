'use client';

import { useRef, useState } from 'react';

import { Check, FileText, Loader2, UploadCloud } from 'lucide-react';

import { Button } from '@applyso/ui/button';

import type { ProfileLatestResume, ResumeHistoryItem } from './profile-types';

interface ParseResult {
  resume_id: string;
  full_name: string;
  file_name: string;
  preferred_role: string | null;
  skills: string[];
}

interface ProfileResumeCardProps {
  resume: ProfileLatestResume | null;
  history?: ResumeHistoryItem[];
  needsReview: boolean;
  confirming: boolean;
  onUploaded?: () => void;
  onConfirm?: () => void;
  onUploadNew?: () => void;
}

function formatBytes(bytes?: number | null): string | null {
  if (bytes === null || bytes === undefined) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value?: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function ProfileResumeCard({
  resume,
  history = [],
  needsReview,
  confirming,
  onUploaded,
  onConfirm,
}: ProfileResumeCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch('/api/resume/parse', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as ParseResult & {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Resume processing failed. Please try again.');
        return;
      }
      setParsed(data);
      onUploaded?.();
    } catch {
      setError('Resume service is unreachable. Please try again.');
    } finally {
      setUploading(false);
    }
  }

  const isCompleted = resume?.status === 'COMPLETED';
  const isProcessing =
    resume?.status === 'PROCESSING' || resume?.status === 'UPLOADED';
  const isFailed = resume?.status === 'FAILED';
  const previousCount = Math.max(0, history.length - (resume ? 1 : 0));
  const previousItems = resume
    ? history.filter((item) => item.id !== resume.id)
    : history;

  const fileUrl = resume ? `/api/resumes/${resume.id}/file` : null;

  return (
    <section aria-label="Resume" id="profile-resume" className="scroll-mt-6">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-mono font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-[#8a8f9d]">
          Resume
        </p>
        {resume ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-[11px] font-semibold text-foreground hover:underline disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Upload new'}
          </button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground mb-3 max-w-[560px]">
        Your primary resume. Used by ApplyOS when matching and applying to
        jobs.
      </p>

      <div className="rounded-[12px] border border-border bg-card p-4 sm:p-5">
        {!resume ? (
          <div className="space-y-3">
            <p className="text-[13px] font-medium">No resume yet</p>
            <p className="text-xs text-muted-foreground">
              Upload your resume to let ApplyOS match and apply for you.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-muted">
              <FileText className="h-5 w-5 text-slate-500 dark:text-[#c5c8d2]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">
                {resume.fileName}
              </p>
              <p className="mt-0.5 text-[11px] font-mono text-muted-foreground">
                Uploaded {formatDate(resume.createdAt)}
                {formatBytes(resume.fileSize)
                  ? ` · ${formatBytes(resume.fileSize)}`
                  : ''}
                {resume.mimeType?.includes('pdf')
                  ? ' · PDF'
                  : resume.mimeType
                    ? ` · ${resume.mimeType.split('/')[1]?.toUpperCase() ?? ''}`
                    : ''}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    Resume analyzed
                  </span>
                ) : isProcessing ? (
                  <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Analyzing resume…
                  </span>
                ) : isFailed ? (
                  <span className="font-medium text-red-500">
                    Analysis failed
                    {resume.errorMessage ? ` — ${resume.errorMessage}` : ''}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{resume.status}</span>
                )}
              </div>
              {isCompleted ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-500" /> Contact
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-500" /> Experience
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-500" /> Skills
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Check className="h-3 w-3 text-emerald-500" /> Education
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {fileUrl ? (
                <>
                  <Button variant="outline" size="sm" asChild>
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                      Preview
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href={`${fileUrl}?download=1`}>Download</a>
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Replace'}
              </Button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => !uploading && inputRef.current?.click()}
          disabled={uploading}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) void handleFile(file);
          }}
          className={`mt-4 w-full rounded-[10px] border border-dashed p-4 flex items-center justify-center gap-2 text-center transition-all duration-150 disabled:opacity-60 ${
            dragging
              ? 'border-foreground bg-muted/60'
              : 'border-border hover:border-muted-foreground/40 hover:bg-muted/60'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          ) : (
            <UploadCloud className="h-4 w-4 text-slate-400" />
          )}
          <span className="text-xs font-medium text-slate-600 dark:text-[#c5c8d2]">
            {uploading
              ? 'Extracting your profile…'
              : resume
                ? 'Upload a new resume — previous versions are kept below'
                : 'Drop a PDF or DOCX, or click to browse'}
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Up to 50MB
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx"
          className="hidden"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = '';
          }}
        />
        {parsed ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            {parsed.file_name}
            {parsed.full_name ? ` · ${parsed.full_name}` : ''}
            {parsed.preferred_role ? ` · ${parsed.preferred_role}` : ''}
            {parsed.skills.length > 0
              ? ` · ${parsed.skills.length} skills`
              : ''}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-[11px] text-red-500">{error}</p>
        ) : null}
        {needsReview ? (
          <div className="mt-3 rounded-[8px] bg-amber-500/10 border border-amber-500/20 px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              Profile updated from resume — review and confirm to lock it in.
            </p>
            <Button
              type="button"
              size="sm"
              disabled={confirming}
              onClick={() => onConfirm?.()}
            >
              {confirming ? 'Confirming…' : 'Confirm extracted profile'}
            </Button>
          </div>
        ) : null}

        {previousCount > 0 ? (
          <div className="mt-3 border-t border-slate-100 dark:border-[#1e2025] pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
              aria-expanded={showHistory}
            >
              {showHistory
                ? 'Hide previous uploads'
                : `${previousCount} previous upload${previousCount === 1 ? '' : 's'} →`}
            </button>
            {showHistory ? (
              <ul className="mt-2 space-y-1.5">
                {previousItems.slice(0, 5).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="truncate font-medium">
                        {item.fileName}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </span>
                    </span>
                    <a
                      href={`/api/resumes/${item.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-medium text-foreground hover:underline"
                    >
                      View
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
