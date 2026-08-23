'use client';

import { useEffect, useState } from 'react';
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Sparkles,
  X,
} from 'lucide-react';

import { Button } from '@applyso/ui/button';
import { Badge } from '@applyso/ui/badge';
import { Input } from '@applyso/ui/input';

export interface VariantContent {
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
    semantic?: Array<{
      node_id: string;
      field: string;
      before?: unknown;
      after?: unknown;
      reason?: string;
    }>;
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

function scoreLabel(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '—';
  const normalized = score <= 1 ? score * 100 : score;
  return `${Math.round(normalized)}%`;
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
  const [suggesting, setSuggesting] = useState(false);
  const [versions, setVersions] = useState<VariantVersionSummary[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialVariant) return;
    setVariant(initialVariant);
    setContent(initialVariant.content);
    setSkillsText(initialVariant.content.skills.join(', '));
    setLoading(false);
  }, [initialVariant]);

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
            job_description: job.description ?? undefined,
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
          setError(data.detail || data.error || 'Failed to create draft');
          return;
        }
        if (cancelled) return;
        setVariant(data);
        setContent(data.content);
        setSkillsText(data.content.skills.join(', '));
        onSaved(data);
      } catch {
        setError('Tailor service is unreachable');
      } finally {
        setLoading(false);
      }
    }

    void loadOrCreateDraft();
    return () => {
      cancelled = true;
    };
  }, [initialVariant, job.dedup_key, job.title, job.company_name, resumeId]);

  useEffect(() => {
    if (!variant?.id) return;
    let cancelled = false;
    async function loadVersions() {
      setVersionsLoading(true);
      try {
        const res = await fetch(
          `/api/resume/${resumeId}/variants/${variant.id}/versions`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { versions?: VariantVersionSummary[] };
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
        setError(data.detail || data.error || 'AI suggestions failed');
        return;
      }
      setVariant(data);
      setContent(data.content);
      setSkillsText(data.content.skills.join(', '));
      onSaved(data);
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
        setError(data.detail || data.error || 'Restore failed');
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

    const payloadContent = {
      ...content,
      skills: skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

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
        setError(
          Array.isArray(data.detail)
            ? data.detail.join(', ')
            : data.detail || data.error || 'Save failed',
        );
        return;
      }
      setVariant(data);
      setContent(data.content);
      setSkillsText(data.content.skills.join(', '));
      setAcceptedIds(new Set());
      onSaved(data);
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
    if (!variant || !content) return;
    setFinalizing(true);
    setError(null);

    const payloadContent = {
      ...content,
      skills: skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };

    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/finalize`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: payloadContent,
            accepted_suggestion_ids: Array.from(acceptedIds),
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(
          Array.isArray(data.detail)
            ? data.detail.join(', ')
            : data.detail || data.error || 'Finalize failed',
        );
        return;
      }
      setVariant(data.variant);
      setContent(data.variant.content);
      setAcceptedIds(new Set());
      onSaved(data.variant);
    } catch {
      setError('Failed to finalize variant');
    } finally {
      setFinalizing(false);
    }
  }

  async function handlePreview() {
    if (!variant || !content) return;
    setPreviewing(true);
    setError(null);
    const payloadContent = {
      ...content,
      skills: skillsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const res = await fetch(
        `/api/resume/${resumeId}/variants/${variant.id}/preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: payloadContent }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(
          Array.isArray(data.detail)
            ? data.detail.join(', ')
            : data.detail || data.error || 'Preview failed',
        );
        return;
      }
      setVariant(data.variant);
      setContent(data.variant.content);
      setSkillsText(data.variant.content.skills.join(', '));
      onSaved(data.variant);
    } catch {
      setError('Failed to compile preview');
    } finally {
      setPreviewing(false);
    }
  }

  if (loading || !content) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded-lg bg-background p-6 shadow-lg flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Loading tailor for {job.company_name}…</span>
        </div>
      </div>
    );
  }

  const suggestions = variant?.suggestions?.suggestions ?? [];
  const semanticDiff = variant?.diff?.semantic ?? [];
  const previewUrl = variant?.artifact_id
    ? `/api/resume/${encodeURIComponent(resumeId)}/variants/${encodeURIComponent(variant.id)}/pdf`
    : null;
  const safeIds = suggestions
    .filter((s) => (s.confidence ?? 0) >= 0.8 && s.risk === 'low')
    .map((s) => s.id);

  function acceptAllSafe() {
    setAcceptedIds(new Set(safeIds));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-2 sm:p-4">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-lg bg-background shadow-xl border">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b px-4 py-3 bg-background">
          <div>
            <p className="font-semibold">Tailor resume</p>
            <p className="text-sm text-muted-foreground">
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
                    {scoreDelta(variant.match_score, variant.baseline_match_score)
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

        <div className="p-4 space-y-4">
          {variant?.suggestions?.overall_assessment ? (
            <p className="text-sm text-muted-foreground rounded border px-3 py-2">
              {variant.suggestions.overall_assessment}
            </p>
          ) : null}

          {saveNotice ? (
            <p className="text-sm text-green-700 rounded border border-green-200 bg-green-50 px-3 py-2">
              {saveNotice}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
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
          </div>

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
                  className="rounded border p-3 space-y-2 text-sm"
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
                      variant={acceptedIds.has(s.id) ? 'default' : 'outline'}
                      onClick={() => toggleSuggestion(s.id)}
                    >
                      {acceptedIds.has(s.id) ? (
                        <Check className="h-3 w-3 mr-1" />
                      ) : null}
                      Accept
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground line-through">
                    {s.current}
                  </p>
                  <p className="text-xs">{s.suggested}</p>
                  <p className="text-xs text-muted-foreground">{s.reason}</p>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-sm font-medium">Manual edits</p>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Professional summary"
              value={content.summary ?? ''}
              onChange={(e) =>
                setContent({ ...content, summary: e.target.value })
              }
              rows={4}
            />
            <Input
              placeholder="Skills (comma-separated)"
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
            />
            {content.work_history.map((role, i) => (
              <div key={`${role.company}-${i}`} className="space-y-1">
                <p className="text-xs font-medium">
                  {role.title} — {role.company}
                </p>
                <textarea
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Highlights (one per line)"
                  value={(role.highlights ?? []).join('\n')}
                  onChange={(e) => {
                    const next = [...content.work_history];
                    next[i] = {
                      ...role,
                      highlights: e.target.value
                        .split('\n')
                        .map((l) => l.trim())
                        .filter(Boolean),
                    };
                    setContent({ ...content, work_history: next });
                  }}
                  rows={3}
                />
              </div>
            ))}
          </div>

          {versions.length > 0 || versionsLoading ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Version history</p>
              {versionsLoading ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {version.change_reason.replaceAll('_', ' ')}
                        {version.created_at
                          ? ` · ${new Date(version.created_at).toLocaleString()}`
                          : ''}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => void handleRestoreVersion(version.id)}
                      >
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {previewUrl ? (
            <div className="space-y-3 rounded-md border border-green-300 bg-green-50/50 p-3">
              <p className="text-sm text-green-700 flex items-center gap-1">
                <Check className="h-4 w-4" />
                {variant?.status === 'ready'
                  ? 'Ready to apply with tailored resume'
                  : 'Draft preview compiled'}
              </p>
              {previewUrl ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <a
                      href={previewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-background"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Open preview
                    </a>
                    <a
                      href={previewUrl}
                      download={`resume-${variant?.id ?? 'resume'}.pdf`}
                      className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-background"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </a>
                  </div>
                  <iframe
                    title={`Tailored resume preview for ${job.company_name}`}
                    src={previewUrl}
                    className="h-[32rem] w-full rounded border bg-white"
                  />
                </>
              ) : null}
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

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant="outline"
              disabled={saving || previewing || finalizing}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save draft
            </Button>
            <Button
              variant="outline"
              disabled={saving || previewing || finalizing}
              onClick={() => void handlePreview()}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Preview draft
            </Button>
            <Button
              disabled={saving || previewing || finalizing}
              onClick={() => void handleFinalize()}
            >
              {finalizing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Mark ready
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
