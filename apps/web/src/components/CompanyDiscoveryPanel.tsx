'use client';

import { useState } from 'react';

import {
  Search,
  Building2,
  ExternalLink,
  Send,
  Globe,
  Loader2,
} from 'lucide-react';

import { analytics } from '@applyso/analytics';
import { Badge } from '@applyso/ui/badge';
import { Button } from '@applyso/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@applyso/ui/card';
import { Input } from '@applyso/ui/input';
import { Label } from '@applyso/ui/label';
import { Separator } from '@applyso/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@applyso/ui/tabs';

import { authClient } from '@/lib/auth-client';

interface DetectResult {
  ats_type: string | null;
  suggested_slug: string | null;
  confidence: string;
  career_page_url: string;
}

interface CanonicalJob {
  external_id: string;
  source: string;
  title: string;
  department: string | null;
  location: string | null;
  location_type: string | null;
  seniority: string | null;
  application_url: string | null;
  dedup_key: string;
}

interface IngestResult {
  ats_type: string;
  ats_slug: string;
  company_id: string;
  jobs_found: number;
  jobs: CanonicalJob[];
}

interface SearchJob {
  external_id: string;
  source: string;
  title: string;
  company_name: string;
  department: string | null;
  location: string | null;
  location_type: string | null;
  seniority: string | null;
  application_url: string | null;
  dedup_key: string;
  ats_type: string;
  ats_slug: string;
}

interface SearchResponse {
  query: string;
  companies_scraped: number;
  total_matches: number;
  jobs: SearchJob[];
}

const confidenceColors: Record<string, string> = {
  high: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  medium:
    'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  low: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20',
};

export function CompanyDiscoveryPanel() {
  const [activeTab, setActiveTab] = useState('url');

  // URL mode
  const [careersUrl, setCareersUrl] = useState('');
  const [detectResult, setDetectResult] = useState<DetectResult | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestResult, setIngestResult] = useState<IngestResult | null>(null);

  // Keyword search mode
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  // Apply
  const [applying, setApplying] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<Record<string, string>>({});

  const [error, setError] = useState<string | null>(null);

  const { data: session } = authClient.useSession();

  // --- URL mode ---
  async function handleDetect() {
    if (!careersUrl.trim()) return;
    setDetecting(true);
    setError(null);
    setDetectResult(null);
    setIngestResult(null);
    try {
      const res = await fetch('/api/jobs/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ career_page_url: careersUrl }),
      });
      const data = await res.json();
      if (res.ok) setDetectResult(data.detect ?? data);
      else setError(data.error || data.detail || 'Detection failed');
    } catch {
      setError('Job agent is not running');
    } finally {
      setDetecting(false);
    }
  }

  async function handleIngest() {
    if (!detectResult?.ats_type || !detectResult?.suggested_slug) return;
    setIngesting(true);
    setError(null);
    try {
      const res = await fetch('/api/jobs/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          atsType: detectResult.ats_type,
          atsSlug: detectResult.suggested_slug,
          companyName: detectResult.suggested_slug,
        }),
      });
      const data = await res.json();
      if (res.ok) setIngestResult(data);
      else setError(data.error || data.detail || 'Ingest failed');
    } catch {
      setError('Job agent is not running');
    } finally {
      setIngesting(false);
    }
  }

  // --- Keyword search mode ---
  async function handleSearch() {
    if (!searchQuery.trim()) return;
    const startTime = Date.now();
    analytics.track(
      'job_search_started',
      { query: searchQuery, source: 'company_scrape' },
      { feature: 'job_discovery' },
    );
    setSearching(true);
    setError(null);
    setSearchResult(null);
    try {
      const res = await fetch('/api/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_title: searchQuery,
          max_companies: 10,
          max_jobs_per_company: 200,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        analytics.track(
          'job_search_completed',
          {
            result_count: data.total_matches ?? data.jobs?.length ?? 0,
            duration_ms: Date.now() - startTime,
            companies_count: data.companies_scraped,
          },
          { feature: 'job_discovery' },
        );
        setSearchResult(data);
      } else {
        analytics.track(
          'job_search_failed',
          { error_code: 'SEARCH_HTTP_ERROR' },
          { feature: 'job_discovery' },
        );
        setError(data.error || data.detail || 'Search failed');
      }
    } catch {
      analytics.track(
        'job_search_failed',
        { error_code: 'AGENT_UNAVAILABLE' },
        { feature: 'job_discovery' },
      );
      setError('Job agent is not running');
    } finally {
      setSearching(false);
    }
  }

  // --- Apply ---
  async function handleApply(job: SearchJob) {
    setApplying(job.dedup_key);
    setError(null);
    try {
      const res = await fetch('/api/jobs/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: job.company_name,
          ats_type: job.ats_type,
          ats_slug: job.ats_slug,
          job_title: job.title,
          application_url: job.application_url,
          external_id: job.external_id,
          user_id: session?.user?.id || 'default',
          full_name: session?.user?.name || 'User',
          email: session?.user?.email || '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setApplyResult((prev) => ({
          ...prev,
          [job.dedup_key]: `Workflow: ${data.workflow_id}`,
        }));
      } else {
        setError(data.error || data.detail || 'Apply failed');
      }
    } catch {
      setError('Orchestrator is not running');
    } finally {
      setApplying(null);
    }
  }

  function renderJobRow(job: SearchJob | CanonicalJob, showApply = false) {
    const isSearchJob = 'company_name' in job && 'ats_type' in job;
    const applyKey = isSearchJob ? (job as SearchJob).dedup_key : '';
    const applied = applyResult[applyKey];

    return (
      <div
        key={
          isSearchJob
            ? (job as SearchJob).dedup_key
            : (job as CanonicalJob).external_id
        }
        className="flex items-center justify-between rounded-[6px] px-2.5 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-[#1f2025] transition-colors"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-slate-900 dark:text-[#f1f3f9]">
            {job.title}
            {isSearchJob && (
              <span className="ml-1.5 text-xs font-normal text-slate-500 dark:text-[#8a8f9d]">
                @ {(job as SearchJob).company_name}
              </span>
            )}
          </p>
          <p className="text-xs text-slate-500 dark:text-[#8a8f9d]">
            {[job.department, job.location].filter(Boolean).join(' · ') ||
              'No location'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 ml-2 shrink-0">
          {job.application_url && (
            <a
              href={job.application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-slate-500 dark:text-[#8a8f9d] hover:text-slate-900 dark:hover:text-[#f1f3f9]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {showApply &&
            isSearchJob &&
            job.application_url &&
            (applied ? (
              <Badge
                variant="outline"
                className="text-xs bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
              >
                queued
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 rounded-[6px]"
                onClick={() => handleApply(job as SearchJob)}
                disabled={applying === applyKey}
              >
                {applying === applyKey ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Apply
              </Button>
            ))}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Job Discovery</CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <p className="mb-4 text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">
            {error}
          </p>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="keyword" className="flex-1">
              <Search className="h-3.5 w-3.5 mr-1.5" />
              Search by Title
            </TabsTrigger>
            <TabsTrigger value="url" className="flex-1">
              <Globe className="h-3.5 w-3.5 mr-1.5" />
              Search by URL
            </TabsTrigger>
          </TabsList>

          {/* Keyword search tab */}
          <TabsContent value="keyword" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="search-query">Job Title or Role</Label>
              <div className="flex gap-2">
                <Input
                  id="search-query"
                  placeholder="e.g. Full Stack Developer, Backend Engineer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button
                  onClick={handleSearch}
                  disabled={searching || !searchQuery.trim()}
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Search
                </Button>
              </div>
            </div>

            {searchResult && (
              <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                    {searchResult.total_matches} matches across{' '}
                    {searchResult.companies_scraped} companies
                  </span>
                  <Badge variant="secondary">
                    &quot;{searchResult.query}&quot;
                  </Badge>
                </div>
                <Separator className="bg-slate-200 dark:bg-[#22242a]" />
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {searchResult.jobs.map((job) => renderJobRow(job, true))}
                </div>
              </div>
            )}

            {!searchResult && !searching && (
              <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
                Search by job title across {20} top tech companies (Stripe,
                Airbnb, Notion, Vercel, OpenAI, Netflix, and more). Results are
                scraped live from their career pages.
              </p>
            )}
          </TabsContent>

          {/* URL tab */}
          <TabsContent value="url" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label
                htmlFor="careers-url"
                className="text-xs text-slate-500 dark:text-[#8a8f9d]"
              >
                Company Careers Page URL
              </Label>
              <div className="flex gap-2">
                <Input
                  id="careers-url"
                  placeholder="https://jobs.lever.co/vercel or https://careers.stripe.com"
                  value={careersUrl}
                  onChange={(e) => setCareersUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDetect()}
                />
                <Button
                  onClick={handleDetect}
                  disabled={detecting || !careersUrl.trim()}
                >
                  <Search className="h-4 w-4" />
                  Detect
                </Button>
              </div>
            </div>

            {detectResult && (
              <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                    ATS Detection
                  </span>
                  <Badge
                    variant="outline"
                    className={confidenceColors[detectResult.confidence] || ''}
                  >
                    {detectResult.confidence}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-slate-500 dark:text-[#8a8f9d]">
                      Type:
                    </span>{' '}
                    <span className="font-medium text-slate-900 dark:text-[#f1f3f9]">
                      {detectResult.ats_type || 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500 dark:text-[#8a8f9d]">
                      Slug:
                    </span>{' '}
                    <span className="font-medium text-slate-900 dark:text-[#f1f3f9]">
                      {detectResult.suggested_slug || 'N/A'}
                    </span>
                  </div>
                </div>
                {detectResult.ats_type && detectResult.suggested_slug && (
                  <Button
                    onClick={handleIngest}
                    disabled={ingesting}
                    className="w-full rounded-[6px]"
                    variant="secondary"
                  >
                    <Building2 className="h-4 w-4" />
                    {ingesting
                      ? 'Scraping jobs...'
                      : `Scrape ${detectResult.ats_type} Jobs`}
                  </Button>
                )}
              </div>
            )}

            {ingestResult && (
              <div className="rounded-[8px] border border-slate-200 dark:border-[#22242a] bg-slate-50 dark:bg-[#0e0f12] p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-900 dark:text-[#f1f3f9]">
                    {ingestResult.jobs_found} Jobs Found
                  </span>
                  <Badge variant="secondary">{ingestResult.ats_type}</Badge>
                </div>
                <Separator className="bg-slate-200 dark:bg-[#22242a]" />
                <div className="max-h-80 space-y-1 overflow-y-auto">
                  {ingestResult.jobs.map((job) => {
                    const sJob: SearchJob = {
                      ...job,
                      company_name: ingestResult.company_id,
                      ats_type: ingestResult.ats_type,
                      ats_slug: ingestResult.ats_slug,
                    };
                    return renderJobRow(sJob, true);
                  })}
                </div>
              </div>
            )}

            {!detectResult && (
              <p className="text-sm text-slate-500 dark:text-[#8a8f9d]">
                Paste a company careers page URL to detect their ATS and scrape
                open positions. Supports Greenhouse, Lever, Ashby, Workable
                (e.g. jobs.workable.com/company/…), Recruitee, and Personio.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
