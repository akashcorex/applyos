'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Skeleton } from '@applyso/ui/skeleton';

import { AvatarUploadDialog } from '@/components/dashboard/AvatarUploadDialog';
import type {
  ProfileRecord,
  ProfileSummary,
  ResumeHistoryItem,
} from '@/components/dashboard/profile-types';
import { ProfileAchievements } from '@/components/dashboard/ProfileAchievements';
import { ProfileActivityHeatmap } from '@/components/dashboard/ProfileActivityHeatmap';
import { ProfileActivityTimeline } from '@/components/dashboard/ProfileActivityTimeline';
import { ProfileHero } from '@/components/dashboard/ProfileHero';
import { ProfileIdentityCard } from '@/components/dashboard/ProfileIdentityCard';
import { ProfileProgressCard } from '@/components/dashboard/ProfileProgressCard';
import { ProfileResumeCard } from '@/components/dashboard/ProfileResumeCard';
import { ProfileStatsCard } from '@/components/dashboard/ProfileStatsCard';
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
    | (ProfileSummary & { error?: string })
    | null;
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
    // Wait a tick so the overview tab is mounted before scrolling.
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
      <div className="w-full max-w-[1240px] mx-auto space-y-8">
        <Skeleton className="h-72 w-full rounded-[14px]" />
        <Skeleton className="h-10 w-full rounded-[8px]" />
        <Skeleton className="h-48 w-full rounded-[12px]" />
        <Skeleton className="h-64 w-full rounded-[12px]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-slate-900 dark:text-[#f1f3f9] pb-8">
      {loadError ? (
        <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {loadError}
        </div>
      ) : null}

      <ProfileHero
        name={displayName}
        email={session?.user?.email ?? ''}
        image={userImage}
        headline={headline}
        location={location}
        workMode={workMode}
        linkedinUrl={linkedinUrl}
        githubUrl={githubUrl}
        portfolioUrl={portfolioUrl}
        progression={summary?.progression ?? null}
        completionPercent={summary?.completion.percent ?? null}
        needsReview={needsReview}
        avatarCacheBust={avatarCacheBust}
        onEdit={handlePrimaryEdit}
        onViewPublic={() => setShowPublicProfile(true)}
        onAvatarEdit={() => setShowAvatarDialog(true)}
      />

      <ProfileTabs
        tab={tab}
        onChange={setTab}
        achievementsBadge={
          summary?.progression
            ? `${summary.progression.earnedAchievements}/${summary.progression.achievements.length}`
            : undefined
        }
      />

      {tab === 'overview' ? (
        <div className="space-y-10">
          <div className="grid gap-4 md:grid-cols-2">
            {summary ? (
              <ProfileProgressCard
                completion={summary.completion}
                onComplete={handlePrimaryEdit}
              />
            ) : null}
            {summary ? (
              <ProfileStatsCard totals={summary.activity.totals} />
            ) : null}
          </div>

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

          <div className="w-full" ref={identityRef}>
            {needsReview ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
                Extracted from your resume — review and confirm. Saving edits
                keeps this unconfirmed until you confirm.
              </p>
            ) : null}
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
                if (patch.githubUrl !== undefined) setGithubUrl(patch.githubUrl);
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
                if (patch.seniority !== undefined) setSeniority(patch.seniority);
                if (patch.totalExperienceYears !== undefined) {
                  setExperienceYears(patch.totalExperienceYears);
                }
              }}
              onSave={() => void saveIdentity()}
            />
          </div>
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="space-y-4">
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

      {tab === 'achievements' ? (
        summary?.progression ? (
          <ProfileAchievements progression={summary.progression} />
        ) : (
          <p className="text-xs text-muted-foreground">
            Achievements unavailable.
          </p>
        )
      ) : null}

      {showPublicProfile ? (
        <PublicProfileModal
          profile={profile}
          name={displayName}
          email={session?.user?.email ?? ''}
          image={userImage}
          avatarCacheBust={avatarCacheBust}
          progression={summary?.progression ?? null}
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
