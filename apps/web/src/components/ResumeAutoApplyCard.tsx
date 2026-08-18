'use client';

import { useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';

import { authClient } from '@/lib/auth-client';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';

interface ParsedResume {
  resume_id: string;
  full_name: string;
  email: string;
  preferred_role?: string | null;
  experience_years: number;
  skills: string[];
  file_path?: string | null;
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
  const [jobRole, setJobRole] = useState('');
  const [yearsExperience, setYearsExperience] = useState(0);
  const [maxApplies, setMaxApplies] = useState(5);
  const [uploading, setUploading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastWorkflowId, setLastWorkflowId] = useState<string | null>(null);

  async function handleUpload(file: File) {
    const userId = session?.user?.id;
    if (!userId) {
      setError('Sign in to upload a resume');
      return;
    }

    setUploading(true);
    setError(null);
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

      const resume = data as ParsedResume;
      setParsed(resume);
      setJobRole(resume.preferred_role || 'Software Engineer');
      setYearsExperience(resume.experience_years || 0);
    } catch {
      setError('Resume agent is not running');
    } finally {
      setUploading(false);
    }
  }

  async function handleStart() {
    const userId = session?.user?.id;
    if (!parsed?.resume_id || !userId) {
      setError('Upload a resume first');
      return;
    }
    if (!jobRole.trim()) {
      setError('Enter a job role');
      return;
    }

    setApplying(true);
    setError(null);

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          resume_id: parsed.resume_id,
          job_role: jobRole.trim(),
          years_experience: yearsExperience,
          max_applies: maxApplies,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || 'Failed to start apply run');
        return;
      }
      const workflowId = data.workflow_id as string;
      setLastWorkflowId(workflowId);
      onWorkflowStarted?.(workflowId);
    } catch {
      setError('Orchestrator is unreachable');
    } finally {
      setApplying(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Auto apply</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
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
            {parsed.skills.length > 0 && (
              <p className="text-muted-foreground">
                {parsed.skills.slice(0, 6).join(', ')}
                {parsed.skills.length > 6 ? '…' : ''}
              </p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="job-role" className="text-sm text-muted-foreground">
            Job role
          </label>
          <Input
            id="job-role"
            placeholder="Backend Engineer"
            value={jobRole}
            onChange={(event) => setJobRole(event.target.value)}
            disabled={!parsed}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="years-experience"
            className="text-sm text-muted-foreground"
          >
            Years of experience
          </label>
          <Input
            id="years-experience"
            type="number"
            min={0}
            max={50}
            value={yearsExperience}
            onChange={(event) =>
              setYearsExperience(Number(event.target.value) || 0)
            }
            disabled={!parsed}
          />
        </div>

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
          disabled={applying || !parsed?.resume_id || !jobRole.trim()}
          onClick={() => void handleStart()}
        >
          {applying ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {applying ? 'Starting run...' : 'Start applying'}
        </Button>

        {lastWorkflowId && (
          <p className="text-sm text-green-700">
            Run started:{' '}
            <span className="font-mono">{lastWorkflowId.slice(0, 8)}…</span>.
            Track per-job submitted/failed status in Workflows.
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
