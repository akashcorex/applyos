'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Sparkles, X } from 'lucide-react';

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
  file_path?: string | null;
}

export interface TailorJobContext {
  dedup_key: string;
  title: string;
  company_name: string;
  description?: string | null;
  missing_skills?: string[];
  matched_skills?: string[];
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
  const [finalizing, setFinalizing] = useState(false);
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
    setSaving(true);
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

  if (loading || !content) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="rounded-lg bg-background p-6 shadow-lg flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Tailoring resume for {job.company_name}…</span>
        </div>
      </div>
    );
  }

  const suggestions = variant?.suggestions?.suggestions ?? [];
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
                <div key={s.id} className="rounded border p-3 space-y-2 text-sm">
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

          {variant?.status === 'ready' && (
            <p className="text-sm text-green-700 flex items-center gap-1">
              <Check className="h-4 w-4" />
              Ready to apply with tailored resume
            </p>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap gap-2 pt-2 border-t">
            <Button
              variant="outline"
              disabled={saving || finalizing}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save draft
            </Button>
            <Button
              disabled={saving || finalizing}
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
