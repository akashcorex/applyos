import { useRef, useState } from 'react';

import { FileText, Loader2, UploadCloud } from 'lucide-react';

import { Button } from '@applyso/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@applyso/ui/card';

import type { ProfileLatestResume } from './profile-types';

interface ParseResult {
  resume_id: string;
  full_name: string;
  file_name: string;
  preferred_role: string | null;
  skills: string[];
}

interface ProfileResumeCardProps {
  resume: ProfileLatestResume | null;
  needsReview: boolean;
  confirming: boolean;
  onUploaded?: () => void;
  onConfirm?: () => void;
}

function statusLabel(status: string): string {
  if (status === 'COMPLETED') return 'Processed';
  if (status === 'PROCESSING' || status === 'UPLOADED') return 'Processing';
  if (status === 'FAILED') return 'Failed';
  return status;
}

export function ProfileResumeCard({
  resume,
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

  return (
    <Card id="profile-resume">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          <CardTitle>Resume</CardTitle>
        </div>
        <CardDescription>
          Upload a resume to apply. We fill name, headline, and experience from
          it. Replacing a file does not auto-confirm extracted details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {resume ? (
          <div className="rounded-[8px] border border-slate-200 dark:border-[#26282e] px-3 py-2 text-xs">
            <p className="font-medium">{resume.fileName}</p>
            <p className="text-slate-500 dark:text-[#8a8f9d] font-mono mt-0.5">
              {statusLabel(resume.status)}
              {resume.processedAt
                ? ` · ${new Date(resume.processedAt).toLocaleString()}`
                : resume.createdAt
                  ? ` · uploaded ${new Date(resume.createdAt).toLocaleString()}`
                  : ''}
            </p>
            {resume.status === 'FAILED' && resume.errorMessage ? (
              <p className="text-red-500 mt-1">{resume.errorMessage}</p>
            ) : null}
          </div>
        ) : null}
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
          className={`w-full border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center gap-2 transition-all duration-150 disabled:opacity-60 ${
            dragging
              ? 'border-emerald-400 bg-emerald-50/60 dark:bg-emerald-950/20'
              : 'border-slate-200 dark:border-[#26282e] hover:border-slate-400 dark:hover:border-[#3e414c] hover:bg-slate-50 dark:hover:bg-[#18191c]'
          }`}
        >
          {uploading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : (
            <UploadCloud className="h-6 w-6 text-slate-400" />
          )}
          <p className="text-xs font-semibold text-slate-600 dark:text-[#c5c8d2]">
            {uploading
              ? 'Extracting your profile…'
              : resume || parsed
                ? 'Drop a file to replace, or click to browse'
                : 'Drop a PDF or DOCX, or click to browse'}
          </p>
          <p className="text-[11px] text-slate-400">Up to 50MB</p>
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
          <p className="text-[11px] text-slate-500 dark:text-[#8a8f9d]">
            {parsed.file_name}
            {parsed.full_name ? ` · ${parsed.full_name}` : ''}
            {parsed.preferred_role ? ` · ${parsed.preferred_role}` : ''}
            {parsed.skills.length > 0
              ? ` · ${parsed.skills.length} skills`
              : ''}
          </p>
        ) : null}
        {error ? <p className="text-[11px] text-red-500">{error}</p> : null}
        {needsReview ? (
          <Button
            type="button"
            size="sm"
            disabled={confirming}
            onClick={() => onConfirm?.()}
          >
            {confirming ? 'Confirming…' : 'Confirm extracted profile'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
