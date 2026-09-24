'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AvatarUploadDialog } from '@/components/dashboard/AvatarUploadDialog';
import type {
  ProfileRecord,
  ProfileSummary,
  ResumeHistoryItem,
} from '@/components/dashboard/profile-types';
import { ProfileActivityHeatmap } from '@/components/dashboard/ProfileActivityHeatmap';
import { ProfileActivityTimeline } from '@/components/dashboard/ProfileActivityTimeline';
import { ProfileHero } from '@/components/dashboard/ProfileHero';
import { ProfileIdentityCard } from '@/components/dashboard/ProfileIdentityCard';
import { ProfileMetricStrip } from '@/components/dashboard/ProfileMetricStrip';
import { ProfileResumeCard } from '@/components/dashboard/ProfileResumeCard';
import {
  ProfileTabs,
  type ProfileTab,
} from '@/components/dashboard/ProfileTabs';
import { PublicProfileModal } from '@/components/dashboard/PublicProfileModal';
import { authClient } from '@/lib/auth-client';

async function fetchProfileBundle(): Promise<{
  profile: ProfileRecord | null;
  summary: ProfileSummary;
  history: ResumeHistoryItem[];
}> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [profileRes, summaryRes, historyRes] = await Promise.all([
    fetch('/api/profiles', { cache: 'no-store' }),
    fetch(`/api/profiles/summary?timeZone=${encodeURIComponent(timeZone)}`, {
      cache: 'no-store',
    }),
    fetch('/api/resumes?limit=10', { cache: 'no-store' }),
  ]);
  const profileData = (await profileRes.json().catch(() => null)) as {
    profile?: ProfileRecord | null;
    error?: string;
  } | null;
  const summaryData = (await summaryRes.json().catch(() => null)) as
    (ProfileSummary & { error?: string }) | null;
  const historyData = (await historyRes.json().catch(() => null)) as {
    resumes?: ResumeHistoryItem[];
  } | null;
  if (!profileRes.ok) {
    throw new Error(profileData?.error ?? 'Could not load profile');
  }
  if (!summaryRes.ok || !summaryData) {
    throw new Error(summaryData?.error ?? 'Could not load profile activity');
  }
  return {
    profile: profileData?.profile ?? null,
    summary: summaryData,
    history: Array.isArray(historyData?.resumes) ? historyData.resumes : [],
  };
}

export default function ProfilePage() {
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const identityRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [history, setHistory] = useState<ResumeHistoryItem[]>([]);
  const [editSignal, setEditSignal] = useState(0);
  const [showPublicProfile, setShowPublicProfile] = useState(false);
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [avatarCacheBust, setAvatarCacheBust] = useState(0);
  const [tab, setTab] = useState<ProfileTab>('overview');

  const [name, setName] = useState(session?.user?.name ?? '');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [phone, setPhone] = useState('');
  const [summaryText, setSummaryText] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [skills, setSkills] = useState('');
  const [preferredRoles, setPreferredRoles] = useState('');
  const [preferredLocations, setPreferredLocations] = useState('');
  const [workMode, setWorkMode] = useState('');
  const [seniority, setSeniority] = useState('');
  const [experienceYears, setExperienceYears] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fallbackName = session?.user?.name ?? '';

  const applyProfile = useCallback(
    (next: ProfileRecord | null) => {
      setProfile(next);
      if (!next) return;
      setName(next.fullName ?? fallbackName);
      setHeadline(next.headline ?? '');
      setLocation(next.location ?? '');
      setPhone(next.phone ?? '');
      setSummaryText(next.professionalSummary ?? '');
      setLinkedinUrl(next.linkedinUrl ?? '');
      setGithubUrl(next.githubUrl ?? '');
      setPortfolioUrl(next.portfolioUrl ?? '');
      setSkills(next.skills?.join(', ') ?? '');
      setPreferredRoles(next.preferredRoles?.join(', ') ?? '');
      setPreferredLocations(next.preferredLocations?.join(', ') ?? '');
      setWorkMode(next.workMode ?? '');
      setSeniority(next.seniority ?? '');
      setExperienceYears(
        next.totalExperienceYears === null ||
          next.totalExperienceYears === undefined
          ? ''
          : String(next.totalExperienceYears),
      );
    },
    [fallbackName],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const bundle = await fetchProfileBundle();
        if (cancelled) return;
        applyProfile(bundle.profile);
        setSummary(bundle.summary);
        setHistory(bundle.history);
        setLoadError(null);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not load profile',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.name, reloadKey, applyProfile]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  async function saveIdentity() {
    setSaving(true);
    setSectionError(null);
    try {
      const experienceTrimmed = experienceYears.trim();
      let totalExperienceYears: number | null = null;
      if (experienceTrimmed !== '') {
        const match = experienceTrimmed.match(/\d+/);
        const parsed = match ? Number.parseInt(match[0], 10) : NaN;
        if (!Number.isFinite(parsed) || parsed < 0 || parsed > 60) {
          setSectionError('Enter experience in years (0–60), e.g. 3');
          setSaving(false);
          return;
        }
        totalExperienceYears = parsed;
      }
      const res = await fetch('/api/profiles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          headline,
          location,
          phone,
          professionalSummary: summaryText,
          linkedinUrl,
          githubUrl,
          portfolioUrl,
          skills: skills
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          preferredRoles: preferredRoles
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          preferredLocations: preferredLocations
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
          workMode: workMode.trim().toLowerCase() || null,
          seniority: seniority.trim().toLowerCase() || null,
          totalExperienceYears,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        profile?: ProfileRecord;
        error?: string;
      } | null;
      if (!res.ok) {
        setSectionError(data?.error ?? 'Failed to save');
        return;
      }
      if (data?.profile) applyProfile(data.profile);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2500);
      setReloadKey((count) => count + 1);
    } catch {
      setSectionError('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      const res = await fetch('/api/profiles/confirm', { method: 'POST' });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setSectionError(data?.error ?? 'Failed to confirm profile');
        return;
      }
      setProfile((current) =>
        current ? { ...current, isConfirmed: true } : current,
      );
      await fetchProfileBundle()
        .then((bundle) => {
          applyProfile(bundle.profile);
          setSummary(bundle.summary);
          setHistory(bundle.history);
        })
        .catch(() => undefined);
    } catch {
      setSectionError('Failed to confirm profile');
    } finally {
      setConfirming(false);
    }
  }

  const needsReview = Boolean(profile && profile.isConfirmed === false);
  const displayName = name || session?.user?.name || 'Your profile';
  const userImage = (session?.user as { image?: string | null } | undefined)
    ?.image;

  function scrollToIdentityAndEdit() {
    setTab('overview');
    setTimeout(() => {
      identityRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
      setEditSignal((n) => n + 1);
    }, 50);
  }

  function scrollToResume() {
    setTab('overview');
    setTimeout(() => {
      document
        .getElementById('profile-resume')
        ?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  function handlePrimaryEdit() {
    if (summary?.completion.nextAction === 'upload-resume') {
      scrollToResume();
      return;
    }
    scrollToIdentityAndEdit();
  }

  if (loading) {
    return (
      <div className="w-full bg-background animate-pulse">
        <div className="h-28 w-full border-b border-border bg-neutral-900/30" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border border-b border-border h-24 bg-neutral-900/10" />
        <div className="h-10 w-full border-b border-border bg-neutral-900/20" />
        <div className="h-44 w-full border-b border-border bg-neutral-900/20" />
        <div className="h-64 w-full border-b border-border bg-neutral-900/20" />
      </div>
    );
  }

  return (
    <div className="w-full bg-background text-foreground animate-fadeIn">
      {loadError ? (
        <div className="border-b border-red-500/20 bg-red-500/10 px-6 sm:px-8 py-3 text-xs font-mono text-red-400">
          {loadError}
        </div>
      ) : null}

      {/* ── 1. Hero Identity Header (Full-bleed) ───────────────── */}
      <ProfileHero
        name={displayName}
        email={session?.user?.email ?? ''}
        image={userImage}
        headline={headline}
        location={location}
        workMode={workMode}
        seniority={seniority}
        linkedinUrl={linkedinUrl}
        githubUrl={githubUrl}
        portfolioUrl={portfolioUrl}
        completionPercent={summary?.completion.percent ?? null}
        needsReview={needsReview}
        avatarCacheBust={avatarCacheBust}
        onEdit={handlePrimaryEdit}
        onViewPublic={() => setShowPublicProfile(true)}
        onAvatarEdit={() => setShowAvatarDialog(true)}
      />

      {/* ── 2. 4-Column KPI Metric Strip (Full-bleed) ───────────── */}
      <ProfileMetricStrip
        completion={summary?.completion}
        experienceYears={experienceYears}
        seniority={seniority}
        totals={summary?.activity.totals}
        onCompleteProfile={handlePrimaryEdit}
      />

      {/* ── 3. Tabs Navigation (Full-bleed) ─────────────────────── */}
      <ProfileTabs tab={tab} onChange={setTab} />

      {/* ── 4. Tab Content: Overview (Full-bleed, 1px lines) ───── */}
      {tab === 'overview' ? (
        <div className="w-full bg-background">
          <ProfileResumeCard
            resume={summary?.resume ?? null}
            history={history}
            needsReview={needsReview}
            confirming={confirming}
            onUploaded={() => {
              setReloadKey((count) => count + 1);
            }}
            onConfirm={() => void handleConfirm()}
          />

          <div ref={identityRef}>
            <ProfileIdentityCard
              name={name}
              email={session?.user?.email ?? ''}
              headline={headline}
              location={location}
              phone={phone}
              summary={summaryText}
              linkedinUrl={linkedinUrl}
              githubUrl={githubUrl}
              portfolioUrl={portfolioUrl}
              skills={skills}
              preferredRoles={preferredRoles}
              preferredLocations={preferredLocations}
              workMode={workMode}
              seniority={seniority}
              experienceYears={experienceYears}
              saving={saving}
              saved={saved}
              error={sectionError}
              openEditSignal={editSignal}
              onChange={(patch) => {
                if (patch.fullName !== undefined) setName(patch.fullName);
                if (patch.headline !== undefined) setHeadline(patch.headline);
                if (patch.location !== undefined) setLocation(patch.location);
                if (patch.phone !== undefined) setPhone(patch.phone);
                if (patch.professionalSummary !== undefined) {
                  setSummaryText(patch.professionalSummary);
                }
                if (patch.linkedinUrl !== undefined) {
                  setLinkedinUrl(patch.linkedinUrl);
                }
                if (patch.githubUrl !== undefined)
                  setGithubUrl(patch.githubUrl);
                if (patch.portfolioUrl !== undefined) {
                  setPortfolioUrl(patch.portfolioUrl);
                }
                if (patch.skills !== undefined) setSkills(patch.skills);
                if (patch.preferredRoles !== undefined) {
                  setPreferredRoles(patch.preferredRoles);
                }
                if (patch.preferredLocations !== undefined) {
                  setPreferredLocations(patch.preferredLocations);
                }
                if (patch.workMode !== undefined) setWorkMode(patch.workMode);
                if (patch.seniority !== undefined)
                  setSeniority(patch.seniority);
                if (patch.totalExperienceYears !== undefined) {
                  setExperienceYears(patch.totalExperienceYears);
                }
              }}
              onSave={() => void saveIdentity()}
            />
          </div>
        </div>
      ) : null}

      {/* ── 5. Tab Content: Activity (Full-bleed, line-divided) ── */}
      {tab === 'activity' ? (
        <div className="w-full bg-background">
          {summary ? (
            <ProfileActivityHeatmap
              days={summary.activity.days}
              totals={summary.activity.totals}
              rangeStart={summary.activity.rangeStart}
              rangeEnd={summary.activity.rangeEnd}
            />
          ) : null}
          <ProfileActivityTimeline items={summary?.activity.timeline ?? []} />
        </div>
      ) : null}

      {/* ── Modals & Dialogs ──────────────────────────────────── */}
      {showPublicProfile ? (
        <PublicProfileModal
          profile={profile}
          name={displayName}
          email={session?.user?.email ?? ''}
          image={userImage}
          avatarCacheBust={avatarCacheBust}
          onClose={() => setShowPublicProfile(false)}
        />
      ) : null}

      {showAvatarDialog ? (
        <AvatarUploadDialog
          name={displayName}
          email={session?.user?.email ?? ''}
          image={userImage}
          cacheBust={avatarCacheBust}
          onClose={() => setShowAvatarDialog(false)}
          onChanged={() => {
            setAvatarCacheBust(Date.now());
            void refetchSession();
          }}
        />
      ) : null}
    </div>
  );
}
