'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Badge } from '@applyso/ui/badge';

interface ParsedResume {
  resume_id: string;
  full_name: string;
  email: string;
  preferred_role?: string | null;
  experience_years: number;
  skills: string[];
  file_path?: string | null;
}

interface MatchedJob {
  title: string;
  company_name: string;
  match_score: number;
  application_url?: string | null;
}

interface MatchPreview {
  total_matches: number;
  jobs: MatchedJob[];
}

interface ResumeAutoApplyCardProps {
  onWorkflowStarted?: (workflowId: string) => void;
}

export function ResumeAutoApplyCard({
  onWorkflowStarted,
}: ResumeAutoApplyCardProps) {
  const { data: session } = authClient.useSession();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [parsed, setParsed] = useState<ParsedResume | null>(null);
  const [matches, setMatches] = useState<MatchPreview | null>(null);
  const [uploading, setUploading] = useState(false);
  const [matching, setMatching] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maxApplies, setMaxApplies] = useState(5);
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      setError('Sign in to upload a resume');
      return;
    }

    setUploading(true);
    setError(null);
    setMatches(null);
    setLastWorkflowId(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('user_id', userId);

      const res = await fetch('/api/resume/parse', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to parse resume');
        return;
      }

      setParsed(data as ParsedResume);
      await loadMatches(data.resume_id);
    } catch {
      setError('Resume agent is not running');
    } finally {
      setUploading(false);
    }
  }

  async function loadMatches(resumeId: string) {
    setMatching(true);
    setError(null);
    try {
      const res = await fetch(`/api/resume/${resumeId}/match`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to find matching jobs');
        return;
      }
      setMatches(data as MatchPreview);
    } catch {
      setError('Job matching failed — ensure job-agent is running');
    } finally {
      setMatching(false);
    }
  }

  async function handleStartApplying() {
    const userId = session?.user?.id;
    if (!parsed?.resume_id || !userId) {
      setError('Upload a resume first');
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const res = await fetch('/api/resume/auto-apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_id: parsed.resume_id,
          user_id: userId,
          max_applies: maxApplies,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || data.detail || 'Auto-apply failed');
        return;
      }

      setLastWorkflowId(data.workflow_id);
      onWorkflowStarted?.(data.workflow_id);
    } catch {
      setError('Auto-apply service is unreachable');
    } finally {
      setApplying(false);
    }
  }

  const topMatches = (matches?.jobs ?? [])
    .filter((job) => job.application_url)
    .slice(0, maxApplies);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg">Resume → Auto Apply</CardTitle>
        <Badge variant="outline" className="bg-violet-100 text-violet-800 border-violet-300">
          Autonomous
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload your resume. We parse it, find matching roles, and apply for you
          — no job search needed.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              void handleUpload(file);
            }
            event.target.value = '';
          }}
        />

        <Button
          className="w-full"
          variant="outline"
          disabled={uploading || !session?.user?.id}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileUp className="h-4 w-4" />
          )}
          {uploading ? 'Parsing resume...' : 'Upload resume (PDF or DOCX)'}
        </Button>

        {parsed && (
          <div className="rounded-md border px-3 py-2 text-sm space-y-1">
            <p className="font-medium">{parsed.full_name}</p>
            <p className="text-muted-foreground">{parsed.email}</p>
            <p>
              Target role:{' '}
              <span className="font-medium">
                {parsed.preferred_role || 'Software Engineer'}
              </span>
            </p>
            <p className="text-muted-foreground">
              {parsed.experience_years} yrs · {parsed.skills.slice(0, 6).join(', ')}
              {parsed.skills.length > 6 ? '…' : ''}
            </p>
          </div>
        )}

        {matching && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Finding matching jobs...
          </p>
        )}

        {matches && !matching && (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {matches.total_matches} matches found
            </p>
            {topMatches.length > 0 ? (
              <ul className="space-y-1 max-h-48 overflow-y-auto text-sm">
                {topMatches.map((job) => (
                  <li
                    key={`${job.company_name}-${job.title}`}
                    className="flex items-center justify-between gap-2 rounded border px-2 py-1"
                  >
                    <span className="truncate">
                      {job.title} · {job.company_name}
                    </span>
                    <Badge variant="outline">
                      {Math.round(job.match_score * 100)}%
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No jobs with application URLs matched yet.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center gap-3">
          <label htmlFor="max-applies" className="text-sm text-muted-foreground">
            Max applies
          </label>
          <input
            id="max-applies"
            type="range"
            min={1}
            max={10}
            value={maxApplies}
            onChange={(event) => setMaxApplies(Number(event.target.value))}
            className="flex-1"
          />
          <span className="text-sm font-medium w-6 text-right">{maxApplies}</span>
        </div>

        <Button
          className="w-full"
          disabled={
            applying ||
            !parsed?.resume_id ||
            matching ||
            topMatches.length === 0
          }
          onClick={() => void handleStartApplying()}
        >
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {applying ? 'Starting applications...' : 'Start applying'}
        </Button>

        {lastWorkflowId && (
          <p className="text-sm text-green-700">
            Workflow started: <span className="font-mono">{lastWorkflowId.slice(0, 8)}…</span>
            . Track progress in Workflows below.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
