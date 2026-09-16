'use client';

import Editor from '@monaco-editor/react';
import { useEffect, useRef, useState } from 'react';

import {
  Check,
  Download,
  ExternalLink,
  FileUp,
  Loader2,
  RotateCcw,
  Sparkles,
  X,
} from 'lucide-react';

import { analytics } from '@applyso/analytics';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';

import { ResumeDocumentCanvas } from '@/components/ResumeDocumentCanvas';
import { pollCompileJob, type CompileJobState } from '@/lib/resume-compile';

export interface VariantContent {
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  skills: string[];
  education: { degree: string; school: string; year?: number | null }[];
  work_history: {
    company: string;
    title: string;
    start_date?: string | null;
    end_date?: string | null;
    highlights?: string[];
  }[];
  preferred_role?: string | null;
}

export interface Suggestion {
  id: string;
  section: string;
  current: string;
  suggested: string;
  reason: string;
  confidence?: number;
  risk?: 'low' | 'medium' | 'high';
}

export interface ResumeVariant {
  id: string;
  resume_id: string;
  dedup_key: string;
  job_title?: string | null;
  company_name?: string | null;
  job_description?: string | null;
  status: 'draft' | 'ready' | 'applied';
  content: VariantContent;
  suggestions: {
    suggestions: Suggestion[];
    overall_assessment?: string;
  };
  source_revision_id?: string | null;
  patch_id?: string | null;
  artifact_id?: string | null;
  artifact_url?: string | null;
  baseline_match_score?: number | null;
  match_score?: number | null;
  match_score_updated_at?: string | null;
  match_score_meta?: {
    semantic_score?: number;
    skill_score?: number;
    matched_skills?: string[];
    missing_skills?: string[];
  } | null;
  updated_at?: string | null;
  diff?: {
    semantic?: {
      node_id: string;
      field: string;
      before?: unknown;
      after?: unknown;
      reason?: string;
    }[];
  };
}

export interface TailorJobContext {
  dedup_key: string;
  title: string;
  company_name: string;
  description?: string | null;
  missing_skills?: string[];
  matched_skills?: string[];
  match_score?: number;
}

const JOB_DESCRIPTION_MAX_LENGTH = 8000;

function truncateJobDescription(
  value: string | null | undefined,
): string | undefined {
  const text = value?.trim();
  if (!text) return undefined;
  return text.length > JOB_DESCRIPTION_MAX_LENGTH
    ? text.slice(0, JOB_DESCRIPTION_MAX_LENGTH)
    : text;
}

function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const detail = (data as { detail?: unknown; error?: unknown }).detail;
  const error = (data as { error?: unknown }).error;
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'msg' in item) {
          return String((item as { msg: unknown }).msg);
        }
        return null;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts.join('; ');
  }
  if (typeof error === 'string' && error.trim()) return error;
  return fallback;
}

function scoreLabel(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—';
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized)}%`;
}

function buildPayload(
  content: VariantContent,
  skillsText: string,
): VariantContent {
  return {
    ...content,
    full_name: content.full_name.trim(),
    email: content.email.trim(),
    phone: content.phone?.trim() || null,
    location: content.location?.trim() || null,
    summary: content.summary?.trim() || null,
    preferred_role: content.preferred_role?.trim() || null,
    skills: skillsText
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
    work_history: content.work_history.map((role) => ({
      ...role,
      company: role.company.trim(),
      title: role.title.trim(),
      start_date: role.start_date?.trim() || null,
      end_date: role.end_date?.trim() || null,
      highlights: (role.highlights ?? [])
        .map((item) => item.trim())
        .filter(Boolean),
    })),
    education: content.education.map((item) => ({
      ...item,
      degree: item.degree.trim(),
      school: item.school.trim(),
    })),
  };
}

function scoreDelta(
  current: number | null | undefined,
  baseline: number | null | undefined,
): string | null {
  if (current == null || baseline == null) return null;
  const c = current <= 1 ? current * 100 : current;
  const b = baseline <= 1 ? baseline * 100 : baseline;
  const delta = Math.round(c - b);
  if (delta === 0) return 'no change';
  return delta > 0 ? `+${delta}` : `${delta}`;
}

interface VariantVersionSummary {
  id: string;
  variant_id: string;
  change_reason: string;
  created_at?: string | null;
}

interface LatexTemplate {
  template_id: string;
  template_version: string;
  display_name: string;
}

interface LatexSourceResponse {
  id?: string | null;
  tex_source?: string | null;
  template_id?: string | null;
  source_hash?: string | null;
}

interface ResumeVariantEditorProps {
  resumeId: string;
  job: TailorJobContext;
  variant: ResumeVariant | null;
  onClose: () => void;
  onSaved: (variant: ResumeVariant) => void;
}

export function ResumeVariantEditor({
  resumeId,
  job,
  variant: initialVariant,
  onClose,
  onSaved,
}: ResumeVariantEditorProps) {
  const [variant, setVariant] = useState<ResumeVariant | null>(initialVariant);
  const [content, setContent] = useState<VariantContent | null>(
    initialVariant?.content ?? null,
  );
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [skillsText, setSkillsText] = useState(
    initialVariant?.content.skills.join(', ') ?? '',
  );
  const [loading, setLoading] = useState(!initialVariant);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [versions, setVersions] = useState<VariantVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [editorTab, setEditorTab] = useState<'structured' | 'latex'>(
    'structured',
  );
  const [latexSource, setLatexSource] = useState('');
  const [sourceHash, setSourceHash] = useState<string | null>(null);
  const [sourceDirty, setSourceDirty] = useState(false);
  const [sourceSaving, setSourceSaving] = useState(false);
  const [sourceImporting, setSourceImporting] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<LatexTemplate[]>([]);
  const [templateId, setTemplateId] = useState('applyos-ats');
  const [compileStatus, setCompileStatus] = useState<CompileJobState | 'idle'>(
    'idle',
  );
  const [compileJobId, setCompileJobId] = useState<string | null>(null);
  const [pdfJobId, setPdfJobId] = useState<string | null>(null);
  const [compileError, setCompileError] = useState<string | null>(null);
  const compileAbortRef = useRef<AbortController | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const sourceSaveAbortRef = useRef<AbortController | null>(null);
  const sourceSaveSequenceRef = useRef(0);
  const sourceLoadedRef = useRef(false);
  const autoPreviewAttemptedRef = useRef<string | null>(null);
  const [sourceReloadNonce, setSourceReloadNonce] = useState(0);

  useEffect(() => {
    return () => compileAbortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!initialVariant) return;
    setVariant(initialVariant);
    setContent(initialVariant.content);
    setSkillsText(initialVariant.content.skills.join(', '));
    setLoading(false);
  }, [initialVariant]);

  useEffect(() => {
    const variantId = variant?.id;
    if (!variantId) return;
    sourceSaveSequenceRef.current += 1;
    sourceSaveAbortRef.current?.abort();
    sourceSaveAbortRef.current = null;
    let cancelled = false;
    sourceLoadedRef.current = false;

    async function loadLatexSource() {
      try {
        const [templatesRes, sourceRes] = await Promise.all([
          fetch(`/api/resume/${resumeId}/templates`),
          fetch(`/api/resume/${resumeId}/variants/${variantId}/source.tex`),
        ]);
        const templatesData = (await templatesRes.json().catch(() => ({}))) as {
          templates?: LatexTemplate[];
        };
        const sourceData = (await sourceRes.json().catch(() => ({}))) as
          LatexSourceResponse | { detail?: string; error?: string };
        if (cancelled) return;
        if (templatesRes.ok) setTemplates(templatesData.templates ?? []);
        if (sourceRes.ok) {
          const source = sourceData as LatexSourceResponse;
          setLatexSource(source.tex_source ?? '');
          setSourceHash(source.source_hash ?? null);
          setTemplateId(source.template_id ?? 'applyos-ats');
          setSourceError(null);
        } else {
          setLatexSource('');
          setSourceHash(null);
          setSourceError('No LaTeX source is stored for this variant yet.');
        }
        setSourceDirty(false);
        sourceLoadedRef.current = true;
      } catch {
        if (!cancelled) setSourceError('Could not load the LaTeX source');
      }
    }

    void loadLatexSource();
    return () => {
      cancelled = true;
      sourceSaveSequenceRef.current += 1;
      sourceSaveAbortRef.current?.abort();
      sourceSaveAbortRef.current = null;
    };
  }, [resumeId, sourceReloadNonce, variant?.id]);

  useEffect(() => {
    if (!sourceDirty || !sourceLoadedRef.current) {
      return;
    }
    const timer = window.setTimeout(() => {
      void persistLatexSource();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [latexSource, sourceDirty, templateId]);

  useEffect(() => {
    if (initialVariant) return;

    let cancelled = false;

    async function loadOrCreateDraft() {
      setLoading(true);
      setError(null);
      try {
        const existingRes = await fetch(
          `/api/resume/${resumeId}/variants?dedup_key=${encodeURIComponent(job.dedup_key)}`,
        );
        if (existingRes.ok) {
          const existingData = await existingRes.json();
          const found = existingData.variants?.[0] as ResumeVariant | undefined;
          if (found) {
            if (!cancelled) {
              setVariant(found);
              setContent(found.content);
              setSkillsText(found.content.skills.join(', '));
              onSaved(found);
            }
            return;
          }
        }

        const res = await fetch(`/api/resume/${resumeId}/variants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dedup_key: job.dedup_key,
            job_title: job.title,
            company_name: job.company_name,
            job_description: truncateJobDescription(job.description),
            missing_skills: job.missing_skills ?? [],
            matched_skills: job.matched_skills ?? [],
            initial_match_score:
              job.match_score != null
                ? job.match_score <= 1
                  ? job.match_score * 100
                  : job.match_score
                : undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) {
            setError(apiErrorMessage(data, 'Failed to create draft'));
          }
          return;
        }
        if (cancelled) return;
        setVariant(data);
        setContent(data.content);
        setSkillsText(data.content.skills.join(', '));
        onSaved(data);
      } catch {
        if (!cancelled) setError('Tailor service is unreachable');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadOrCreateDraft();
    return () => {
      cancelled = true;
    };
  }, [
    initialVariant,
    job.company_name,
    job.dedup_key,
    job.description,
    job.title,
    reloadNonce,
    resumeId,
  ]);

  async function persistLatexSource(): Promise<boolean> {
    if (!variant) return false;
    if (!latexSource.trim()) {
      setSourceError('LaTeX source cannot be empty');
      return false;
    }
    const sequence = ++sourceSaveSequenceRef.current;
    sourceSaveAbortRef.current?.abort();
    const controller = new AbortController();
    sourceSaveAbortRef.current = controller;
    setSourceSaving(true);
    setSourceError(null);
    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/source.tex`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tex_source: latexSource,
            template_id: templateId,
            expected_source_hash: sourceHash ?? undefined,
          }),
          signal: controller.signal,
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        LatexSourceResponse | { detail?: unknown; error?: unknown };
      if (sequence !== sourceSaveSequenceRef.current) return false;
      if (!res.ok) {
        setSourceError(apiErrorMessage(data, 'Failed to save LaTeX source'));
        return false;
      }
      const saved = data as LatexSourceResponse;
      setSourceHash(saved.source_hash ?? null);
      setSourceDirty(false);
      setSourceError(null);
      return true;
    } catch {
      if (sequence !== sourceSaveSequenceRef.current) return false;
      setSourceError('Failed to save LaTeX source');
      return false;
    } finally {
      if (sequence === sourceSaveSequenceRef.current) {
        setSourceSaving(false);
      }
    }
  }

  async function importLatexSource(file: File) {
    if (sourceDirty) {
      setSourceError('Save your current LaTeX changes before importing');
      return;
    }
    setSourceImporting(true);
    setSourceError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('template_id', templateId);
      const res = await fetch(`/api/resume/${resumeId}/import-tex`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSourceError(apiErrorMessage(data, 'Failed to import LaTeX source'));
        return;
      }
      setSourceReloadNonce((value) => value + 1);
      setSaveNotice('LaTeX source imported');
    } catch {
      setSourceError('Failed to import LaTeX source');
    } finally {
      setSourceImporting(false);
    }
  }

  function applyVariant(data: unknown): ResumeVariant | null {
    if (!data || typeof data !== 'object') return null;
    const candidate =
      'variant' in data ? (data as { variant?: unknown }).variant : data;
    if (!candidate || typeof candidate !== 'object') return null;
    const next = candidate as ResumeVariant;
    setVariant(next);
    setContent(next.content);
    setSkillsText(next.content.skills.join(', '));
    onSaved(next);
    return next;
  }

  async function runCompile(kind: 'preview' | 'finalize') {
    if (!variant || !content) return;
    if (editorTab === 'latex' && !latexSource.trim()) {
      setCompileError('LaTeX source cannot be empty');
      setError('LaTeX source cannot be empty');
      return;
    }
    if (editorTab === 'latex' && sourceDirty && !(await persistLatexSource())) {
      return;
    }
    const controller = new AbortController();
    compileAbortRef.current?.abort();
    compileAbortRef.current = controller;
    setCompileError(null);
    setError(null);
    setCompileJobId(null);
    setPdfJobId(null);
    setCompileStatus('queued');
    if (kind === 'preview') setPreviewing(true);
    else setFinalizing(true);

    try {
      const body: Record<string, unknown> = {
        source_mode: editorTab,
      };
      if (editorTab === 'structured') {
        body.content = buildPayload(content, skillsText);
        body.accepted_suggestion_ids = Array.from(acceptedIds);
        body.template_id = templateId;
      }
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/${kind}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (!res.ok && res.status !== 202) {
        throw new Error(apiErrorMessage(data, `${kind} failed`));
      }
      if (res.status === 202 && typeof data.job_id === 'string') {
        const jobId = data.job_id;
        setCompileJobId(jobId);
        const completed = await pollCompileJob(resumeId, jobId, {
          signal: controller.signal,
          onStatus: setCompileStatus,
        });
        if (completed.job.status !== 'ready') {
          throw new Error('LaTeX compilation failed');
        }
        setCompileStatus('ready');
        const variantRes = await fetch(
          `/api/resume/${resumeId}/variants/${variant.id}`,
          { signal: controller.signal },
        );
        const variantData = await variantRes.json().catch(() => ({}));
        if (!variantRes.ok) {
          throw new Error(
            apiErrorMessage(
              variantData,
              'Compiled variant could not be loaded',
            ),
          );
        }
        applyVariant(variantData);
        setPdfJobId(jobId);
        if (editorTab === 'structured' && !sourceDirty) {
          setSourceReloadNonce((value) => value + 1);
        }
      } else {
        const next = applyVariant(data);
        if (!next) throw new Error(`${kind} returned no variant`);
        setCompileStatus('ready');
        setPdfJobId(null);
        if (editorTab === 'structured' && !sourceDirty) {
          setSourceReloadNonce((value) => value + 1);
        }
      }
      setAcceptedIds(new Set());
    } catch (caught) {
      if (controller.signal.aborted) return;
      const message =
        caught instanceof Error ? caught.message : `${kind} failed`;
      setCompileStatus('failed');
      setPdfJobId(null);
      setCompileError(message);
      setError(message);
    } finally {
      if (compileAbortRef.current === controller) {
        compileAbortRef.current = null;
      }
      if (kind === 'preview') setPreviewing(false);
      else setFinalizing(false);
    }
  }

  useEffect(() => {
    const variantId = variant?.id;
    if (!variantId) return;
    let cancelled = false;
    async function loadVersions() {
      setVersionsLoading(true);
      try {
        const res = await fetch(
          `/api/resume/${resumeId}/variants/${variantId}/versions`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          versions?: VariantVersionSummary[];
        };
        if (!cancelled) setVersions(data.versions ?? []);
      } finally {
        if (!cancelled) setVersionsLoading(false);
      }
    }
    void loadVersions();
    return () => {
      cancelled = true;
    };
  }, [resumeId, variant?.id, variant?.updated_at]);

  async function handleGetAiSuggestions() {
    if (!variant) return;
    setSuggesting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/suggest`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data, 'AI suggestions failed'));
        return;
      }
      setVariant({ ...data, content });
      onSaved({ ...data, content });
    } catch {
      setError('Failed to fetch AI suggestions');
    } finally {
      setSuggesting(false);
    }
  }

  async function handleRestoreVersion(versionId: string) {
    if (!variant) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/versions/${versionId}/restore`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data, 'Restore failed'));
        return;
      }
      setVariant(data);
      setContent(data.content);
      setSkillsText(data.content.skills.join(', '));
      setAcceptedIds(new Set());
      onSaved(data);
      const delta = scoreDelta(data.match_score, data.baseline_match_score);
      setSaveNotice(
        delta
          ? `Restored · match ${scoreLabel(data.match_score)} (${delta})`
          : `Restored · match ${scoreLabel(data.match_score)}`,
      );
    } catch {
      setError('Failed to restore version');
    } finally {
      setSaving(false);
    }
  }

  function toggleSuggestion(id: string) {
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSaveDraft() {
    if (!variant || !content) return;
    const priorScore = variant.match_score;
    setSaving(true);
    setError(null);
    setSaveNotice(null);

    const payloadContent = buildPayload(content, skillsText);

    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: payloadContent,
            accepted_suggestion_ids: Array.from(acceptedIds),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data, 'Save failed'));
        return;
      }
      setVariant(data);
      setContent(data.content);
      setSkillsText(data.content.skills.join(', '));
      setAcceptedIds(new Set());
      onSaved(data);
      analytics.track(
        'resume_variant_saved',
        {
          variant_id: data.id,
          match_score: data.match_score ?? undefined,
        },
        { feature: 'resume_builder' },
      );
      const delta = scoreDelta(data.match_score, data.baseline_match_score);
      const from = scoreLabel(priorScore ?? data.baseline_match_score);
      const to = scoreLabel(data.match_score);
      setSaveNotice(
        delta && priorScore != null
          ? `Saved · match ${from} → ${to} (${delta})`
          : `Saved · match ${to}${delta ? ` (${delta})` : ''}`,
      );
    } catch {
      setError('Failed to save draft');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinalize() {
    await runCompile('finalize');
  }

  async function handlePreview() {
    await runCompile('preview');
  }

  async function handleReject() {
    if (!variant) return;
    setRejecting(true);
    setError(null);
    setCompileError(null);
    setSaveNotice(null);
    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/reject`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(apiErrorMessage(data, 'Could not reject this variant'));
        return;
      }
      setVariant(data);
      setContent(data.content);
      setSkillsText(data.content.skills.join(', '));
      setAcceptedIds(new Set());
      setPdfJobId(null);
      setCompileStatus('idle');
      autoPreviewAttemptedRef.current = null;
      onSaved(data);
      setSaveNotice('Rejected · fresh keyword suggestions applied');
    } catch {
      setError('Failed to reject variant');
    } finally {
      setRejecting(false);
    }
  }

  useEffect(() => {
    if (loading || !variant || previewing || finalizing || rejecting) return;
    if (variant.status !== 'draft' || !variant.patch_id) return;
    if (variant.artifact_id || pdfJobId) return;
    if (autoPreviewAttemptedRef.current === variant.id) return;
    autoPreviewAttemptedRef.current = variant.id;
    void runCompile('preview');
  }, [finalizing, loading, pdfJobId, previewing, rejecting, variant]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="rounded-[12px] bg-white dark:bg-[#16171b] border border-slate-200 dark:border-[#282a32] p-6 shadow-2xl space-y-4 max-w-sm w-full text-slate-900 dark:text-[#f1f3f9]">
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-slate-900 dark:text-[#f1f3f9]" />
            <span>Loading tailor for {job.company_name}…</span>
          </div>
          <Button
            variant="outline"
            className="w-full rounded-[6px]"
            onClick={onClose}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (error && !content) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="rounded-[12px] bg-white dark:bg-[#16171b] border border-slate-200 dark:border-[#282a32] p-6 shadow-2xl space-y-4 max-w-sm w-full text-slate-900 dark:text-[#f1f3f9]">
          <div>
            <p className="font-semibold text-slate-900 dark:text-[#f1f3f9]">
              Could not open tailor
            </p>
            <p className="text-sm text-slate-500 dark:text-[#8a8f9d] mt-1">
              {job.title} · {job.company_name}
            </p>
          </div>
          <p className="text-sm text-red-500">{error}</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 rounded-[6px]"
              onClick={() => setReloadNonce((n) => n + 1)}
            >
              Try again
            </Button>
            <Button className="flex-1 rounded-[6px]" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
        <div className="rounded-[12px] bg-white dark:bg-[#16171b] border border-slate-200 dark:border-[#282a32] p-6 shadow-2xl space-y-4 max-w-sm w-full text-slate-900 dark:text-[#f1f3f9]">
          <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
            No resume content is available to edit.
          </p>
          <Button className="w-full rounded-[6px]" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  const suggestions = variant?.suggestions?.suggestions ?? [];
  const semanticDiff = variant?.diff?.semantic ?? [];
  const previewUrl = pdfJobId
    ? `/api/resume/${encodeURIComponent(resumeId)}/compile-jobs/${encodeURIComponent(pdfJobId)}/pdf`
    : variant?.artifact_id
      ? `/api/resume/${encodeURIComponent(resumeId)}/variants/${encodeURIComponent(variant.id)}/pdf`
      : null;
  const safeIds = suggestions
    .filter((s) => (s.confidence ?? 0) >= 0.8 && s.risk === 'low')
    .map((s) => s.id);

  function acceptAllSafe() {
    setAcceptedIds(new Set(safeIds));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
      <div className="flex w-full max-w-6xl max-h-[92vh] flex-col overflow-hidden rounded-[12px] bg-white dark:bg-[#16171b] shadow-2xl border border-slate-200 dark:border-[#282a32] text-slate-900 dark:text-[#f1f3f9]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-[#282a32] px-4 py-3 bg-white dark:bg-[#16171b]">
          <div>
            <p className="font-semibold text-slate-900 dark:text-[#f1f3f9]">
              Tailor resume
            </p>
            <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
              {job.title} · {job.company_name}
            </p>
            {variant ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="secondary">
                  Match {scoreLabel(variant.match_score)}
                </Badge>
                {variant.baseline_match_score != null ? (
                  <span className="text-muted-foreground">
                    baseline {scoreLabel(variant.baseline_match_score)}
                    {scoreDelta(
                      variant.match_score,
                      variant.baseline_match_score,
                    )
                      ? ` (${scoreDelta(variant.match_score, variant.baseline_match_score)})`
                      : ''}
                  </span>
                ) : null}
                {variant.match_score_meta ? (
                  <span className="text-muted-foreground">
                    semantic{' '}
                    {Math.round(
                      (variant.match_score_meta.semantic_score ?? 0) * 100,
                    )}
                    % · skills{' '}
                    {Math.round(
                      (variant.match_score_meta.skill_score ?? 0) * 100,
                    )}
                    %
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
            <div className="space-y-3">
              {saveNotice ? (
                <p className="text-sm text-green-700 rounded border border-green-200 bg-green-50 px-3 py-2">
                  {saveNotice}
                </p>
              ) : null}
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex items-center gap-2 border-b border-slate-200 dark:border-[#282a32]">
                <Button
                  type="button"
                  size="sm"
                  variant={editorTab === 'structured' ? 'default' : 'ghost'}
                  onClick={() => setEditorTab('structured')}
                >
                  Structured
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={editorTab === 'latex' ? 'default' : 'ghost'}
                  onClick={() => {
                    setEditorTab('latex');
                    if (!sourceDirty) {
                      setSourceReloadNonce((value) => value + 1);
                    }
                  }}
                >
                  LaTeX source
                </Button>
              </div>
              {editorTab === 'structured' ? (
                <ResumeDocumentCanvas
                  content={content}
                  skillsText={skillsText}
                  onContentChange={setContent}
                  onSkillsTextChange={setSkillsText}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      className="text-sm font-medium"
                      htmlFor="latex-template"
                    >
                      Template
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        id="latex-template"
                        value={templateId}
                        onChange={(event) => {
                          setTemplateId(event.target.value);
                          setSourceDirty(true);
                        }}
                        className="rounded border bg-background px-2 py-1 text-sm"
                      >
                        {(templates.length > 0
                          ? templates
                          : [
                              {
                                template_id: 'applyos-ats',
                                template_version: 'ats-latex.v1',
                                display_name: 'ApplyOS ATS',
                              },
                            ]
                        ).map((template) => (
                          <option
                            key={template.template_id}
                            value={template.template_id}
                          >
                            {template.display_name}
                          </option>
                        ))}
                      </select>
                      <input
                        ref={sourceFileInputRef}
                        type="file"
                        accept=".tex,application/x-tex,text/plain"
                        className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) void importLatexSource(file);
                          event.target.value = '';
                        }}
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={sourceImporting}
                        onClick={() => sourceFileInputRef.current?.click()}
                      >
                        <FileUp className="mr-1 h-3.5 w-3.5" />
                        Import
                      </Button>
                    </div>
                  </div>
                  <Editor
                    height="34rem"
                    defaultLanguage="latex"
                    theme="vs-dark"
                    value={latexSource}
                    onChange={(value) => {
                      setLatexSource(value ?? '');
                      setSourceDirty(true);
                    }}
                    options={{
                      minimap: { enabled: false },
                      wordWrap: 'on',
                      fontSize: 13,
                      automaticLayout: true,
                    }}
                  />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      {sourceSaving
                        ? 'Saving source…'
                        : sourceDirty
                          ? 'Unsaved source changes'
                          : sourceHash
                            ? `Saved · ${sourceHash.slice(0, 12)}`
                            : 'Generated source will be stored on save'}
                    </span>
                    {sourceError ? (
                      <span className="text-red-600">{sourceError}</span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <div className="space-y-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={suggesting || !variant}
                  onClick={() => void handleGetAiSuggestions()}
                >
                  {suggesting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  Get AI suggestions
                </Button>
                <p className="text-xs text-muted-foreground">
                  AI proposes keyword edits. Accept them here, or type directly
                  on the page.
                </p>
              </div>

              {variant?.suggestions?.overall_assessment ? (
                <p className="text-sm text-muted-foreground rounded border px-3 py-2">
                  {variant.suggestions.overall_assessment}
                </p>
              ) : null}

              {(job.missing_skills?.length ?? 0) > 0 && (
                <div className="flex flex-wrap gap-1">
                  {job.missing_skills!.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      gap: {skill}
                    </Badge>
                  ))}
                </div>
              )}

              {suggestions.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">AI suggestions</p>
                    {safeIds.length > 0 ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={acceptAllSafe}
                      >
                        Accept all safe ({safeIds.length})
                      </Button>
                    ) : null}
                  </div>
                  {suggestions.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-[8px] border border-[#26282e] bg-[#141518] p-3 space-y-2 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Badge variant="secondary">{s.section}</Badge>
                          {s.risk ? (
                            <Badge
                              variant={
                                s.risk === 'high'
                                  ? 'destructive'
                                  : s.risk === 'medium'
                                    ? 'outline'
                                    : 'secondary'
                              }
                              className="text-[10px]"
                            >
                              {s.risk} risk
                            </Badge>
                          ) : null}
                          {s.confidence != null ? (
                            <Badge variant="outline" className="text-[10px]">
                              {Math.round(s.confidence * 100)}% conf
                            </Badge>
                          ) : null}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant={
                            acceptedIds.has(s.id) ? 'default' : 'outline'
                          }
                          className="rounded-[6px]"
                          onClick={() => toggleSuggestion(s.id)}
                        >
                          {acceptedIds.has(s.id) ? (
                            <Check className="h-3 w-3 mr-1" />
                          ) : null}
                          Accept
                        </Button>
                      </div>
                      <p className="text-xs text-[#8a8f9d] line-through">
                        {s.current}
                      </p>
                      <p className="text-xs text-[#f1f3f9]">{s.suggested}</p>
                      <p className="text-xs text-[#8a8f9d]">{s.reason}</p>
                    </div>
                  ))}
                </div>
              )}

              {versions.length > 0 || versionsLoading ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-[#f1f3f9]">
                    Version history
                  </p>
                  {versionsLoading ? (
                    <p className="text-xs text-[#8a8f9d]">Loading…</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {versions.map((version) => (
                        <div
                          key={version.id}
                          className="flex items-center justify-between gap-2 rounded-[6px] border border-[#26282e] bg-[#141518] px-2.5 py-1.5 text-xs"
                        >
                          <span className="text-[#8a8f9d]">
                            {version.change_reason.replaceAll('_', ' ')}
                            {version.created_at
                              ? ` · ${new Date(version.created_at).toLocaleString()}`
                              : ''}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-[4px] h-6 px-2 text-xs"
                            disabled={saving}
                            onClick={() =>
                              void handleRestoreVersion(version.id)
                            }
                          >
                            Restore
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {compileStatus !== 'idle' ? (
                <div className="rounded-[8px] border border-slate-200 bg-slate-50 p-3 text-sm dark:border-[#282a32] dark:bg-[#141518]">
                  {compileStatus === 'failed' ? (
                    <p className="text-red-600">
                      {compileError ?? 'LaTeX compilation failed'}
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      {compileStatus === 'ready'
                        ? 'Compilation complete'
                        : `Compilation ${compileStatus}…`}
                    </p>
                  )}
                  {compileJobId ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Job {compileJobId}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {previewUrl ? (
                <div className="space-y-3 rounded-[8px] border border-emerald-800/50 bg-emerald-950/40 p-3.5">
                  <p className="text-sm text-emerald-400 flex items-center gap-1">
                    <Check className="h-4 w-4" />
                    {variant?.status === 'ready'
                      ? 'Ready to apply with tailored resume'
                      : 'Draft preview compiled'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#26282e] bg-[#141518] text-[#f1f3f9] px-3 py-1.5 text-xs font-semibold hover:bg-[#1f2025]"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open PDF
                    </a>
                    <a
                      href={previewUrl}
                      download={`resume-${variant?.id ?? 'resume'}.pdf`}
                      className="inline-flex items-center gap-1 rounded-[6px] border border-[#26282e] bg-[#141518] text-[#f1f3f9] px-3 py-1.5 text-xs font-semibold hover:bg-[#1f2025]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </a>
                  </div>
                  <iframe
                    title="Compiled resume preview"
                    src={previewUrl}
                    className="h-[32rem] w-full rounded border border-emerald-800/50 bg-white"
                  />
                  {semanticDiff.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-green-900">
                        Changes applied
                      </p>
                      {semanticDiff.map((entry) => (
                        <p
                          key={`${entry.node_id}-${entry.field}`}
                          className="text-xs text-green-900"
                        >
                          {entry.field}: {String(entry.reason || 'Updated')}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </aside>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t bg-background px-4 py-3">
          <Button
            variant="outline"
            disabled={saving || previewing || finalizing || rejecting}
            onClick={() => void handleSaveDraft()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save draft
          </Button>
          <Button
            variant="outline"
            disabled={saving || previewing || finalizing || rejecting}
            onClick={() => void handlePreview()}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Preview PDF
          </Button>
          <Button
            variant="outline"
            disabled={saving || previewing || finalizing || rejecting}
            onClick={() => void handleReject()}
          >
            {rejecting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Reject & retry
          </Button>
          <Button
            disabled={saving || previewing || finalizing || rejecting}
            onClick={() => void handleFinalize()}
          >
            {finalizing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Approve resume
          </Button>
        </div>
      </div>
    </div>
  );
}
