'use client';

import { useRef, useState } from 'react';

import { Button } from '@applyso/ui/button';
import {
  Check,
  Download,
  Eye,
  FileText,
  Loader2,
  UploadCloud,
} from '@applyso/ui/icons';

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
    <section
      aria-label="Resume"
      id="profile-resume"
      className="w-full border-b border-border bg-background scroll-mt-6"
    >
      {/* ── Section Header (Flush 1px hairline) ────────────────── */}
      <div className="flex items-center justify-between border-b border-border px-6 sm:px-8 py-3.5 bg-background">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground font-mono">
            Primary Resume
          </h2>
          <span className="hidden sm:inline text-xs text-zinc-500 font-mono">
            · ATS parsed candidate vectors for auto-fill
          </span>
        </div>
        {resume ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="h-7 text-xs font-mono text-zinc-300 hover:text-foreground hover:bg-neutral-900 disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : '+ Upload New'}
          </Button>
        ) : null}
      </div>

      {/* ── Section Body (Flush edge-to-edge) ──────────────────── */}
      <div className="px-6 sm:px-8 py-5 space-y-4">
        {!resume ? (
          <div className="space-y-1.5 py-1">
            <p className="text-sm font-semibold text-foreground">
              No resume uploaded
            </p>
            <p className="text-xs text-muted-foreground">
              Upload your resume in PDF or DOCX format to populate candidate
              parameters and enable 1-click matching.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start justify-between">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-border bg-neutral-900/60">
                <FileText className="h-4 w-4 text-blue-400" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-foreground">
                  {resume.fileName}
                </p>
                <p className="mt-0.5 text-xs font-mono text-muted-foreground">
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
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400 text-xs font-mono">
                      <Check className="h-3.5 w-3.5" />
                      ATS Ready & Verified
                    </span>
                  ) : isProcessing ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground text-xs font-mono">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Extracting candidate vectors…
                    </span>
                  ) : isFailed ? (
                    <span className="font-medium text-red-400 text-xs font-mono">
                      Parsing error
                      {resume.errorMessage ? ` — ${resume.errorMessage}` : ''}
                    </span>
                  ) : (
                    <span className="text-muted-foreground font-mono text-xs">
                      {resume.status}
                    </span>
                  )}
                </div>

                {isCompleted ? (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono text-muted-foreground">
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Check className="h-3 w-3 text-emerald-500" /> Contact
                      Info
                    </span>
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Check className="h-3 w-3 text-emerald-500" /> Experience
                      History
                    </span>
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Check className="h-3 w-3 text-emerald-500" /> Core Skills
                    </span>
                    <span className="inline-flex items-center gap-1 text-zinc-300">
                      <Check className="h-3 w-3 text-emerald-500" /> Education
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {fileUrl ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-[4px] border-border bg-background hover:bg-neutral-900 text-xs font-mono"
                    asChild
                  >
                    <a href={fileUrl} target="_blank" rel="noopener noreferrer">
                      <Eye className="mr-1.5 h-3 w-3 text-muted-foreground" />
                      Preview
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-[4px] border-border bg-background hover:bg-neutral-900 text-xs font-mono"
                    asChild
                  >
                    <a href={`${fileUrl}?download=1`}>
                      <Download className="mr-1.5 h-3 w-3 text-muted-foreground" />
                      Download
                    </a>
                  </Button>
                </>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-7 rounded-[4px] border-border bg-background hover:bg-neutral-900 text-xs font-mono"
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? 'Uploading…' : 'Replace File'}
              </Button>
            </div>
          </div>
        )}

        {/* Dropzone */}
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
          className={`w-full rounded-[4px] border border-dashed py-3 px-4 flex items-center justify-center gap-2.5 text-center transition-colors disabled:opacity-60 ${
            dragging
              ? 'border-foreground bg-neutral-900/60'
              : 'border-border hover:border-neutral-700 bg-neutral-900/10 hover:bg-neutral-900/30'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
          ) : (
            <UploadCloud className="h-4 w-4 text-zinc-400" />
          )}
          <span className="text-xs font-medium text-zinc-300">
            {uploading
              ? 'Parsing resume with NLP engine…'
              : resume
                ? 'Drop a newer version to replace, or click to browse'
                : 'Drop a PDF or DOCX file here, or click to browse'}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground">
            (up to 50MB)
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
          <p className="text-xs font-mono text-emerald-400">
            Parsed: {parsed.file_name}
            {parsed.full_name ? ` · ${parsed.full_name}` : ''}
            {parsed.preferred_role ? ` · ${parsed.preferred_role}` : ''}
            {parsed.skills.length > 0
              ? ` · ${parsed.skills.length} skills identified`
              : ''}
          </p>
        ) : null}

        {error ? (
          <p className="text-xs font-mono text-red-400">{error}</p>
        ) : null}

        {needsReview ? (
          <div className="rounded-[4px] bg-amber-500/10 border border-amber-500/20 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-amber-300">
              Resume parsed. Review candidate details below and confirm to lock
              in for automated submissions.
            </p>
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs bg-amber-500 hover:bg-amber-600 text-black font-semibold shrink-0"
              disabled={confirming}
              onClick={() => onConfirm?.()}
            >
              {confirming ? 'Confirming…' : 'Confirm Extracted Profile'}
            </Button>
          </div>
        ) : null}

        {/* Previous Uploads History */}
        {previousCount > 0 ? (
          <div className="border-t border-border/80 pt-3">
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showHistory}
            >
              {showHistory
                ? '▾ Hide Previous Uploads'
                : `▸ Show Previous Uploads (${previousCount})`}
            </button>
            {showHistory ? (
              <div className="mt-2 divide-y divide-border border border-border rounded-[4px] overflow-hidden">
                {previousItems.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between px-3.5 py-2 text-xs bg-background hover:bg-neutral-900/30 transition-colors"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-zinc-300">
                        {item.fileName}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>
                    <a
                      href={`/api/resumes/${item.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 font-mono text-xs text-zinc-400 hover:text-foreground transition-colors underline underline-offset-2"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
