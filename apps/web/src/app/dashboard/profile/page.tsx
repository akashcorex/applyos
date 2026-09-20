'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { Skeleton } from '@applyso/ui/skeleton';

import type {
  ProfileRecord,
  ProfileSummary,
} from '@/components/dashboard/profile-types';
import { ProfileActivityHeatmap } from '@/components/dashboard/ProfileActivityHeatmap';
import { ProfileHeader } from '@/components/dashboard/ProfileHeader';
import { ProfileIdentityCard } from '@/components/dashboard/ProfileIdentityCard';
import { ProfileResumeCard } from '@/components/dashboard/ProfileResumeCard';
import { authClient } from '@/lib/auth-client';

async function fetchProfileBundle(): Promise<{
  profile: ProfileRecord | null;
  summary: ProfileSummary;
}> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [profileRes, summaryRes] = await Promise.all([
    fetch('/api/profiles', { cache: 'no-store' }),
    fetch(`/api/profiles/summary?timeZone=${encodeURIComponent(timeZone)}`, {
      cache: 'no-store',
    }),
  ]);
  const profileData = (await profileRes.json().catch(() => null)) as {
    profile?: ProfileRecord | null;
    error?: string;
  } | null;
  const summaryData = (await summaryRes.json().catch(() => null)) as
    (ProfileSummary & { error?: string }) | null;
  if (!profileRes.ok) {
    throw new Error(profileData?.error ?? 'Could not load profile');
  }
  if (!summaryRes.ok || !summaryData) {
    throw new Error(summaryData?.error ?? 'Could not load profile activity');
  }
  return { profile: profileData?.profile ?? null, summary: summaryData };
}

export default function ProfilePage() {
  const { data: session } = authClient.useSession();
  const identityRef = useRef<HTMLDivElement>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);

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

  if (loading) {
    return (
      <div className="w-full max-w-[1240px] mx-auto space-y-6">
        <Skeleton className="h-28 w-full rounded-[12px]" />
        <Skeleton className="h-64 w-full rounded-[12px]" />
        <Skeleton className="h-80 w-full rounded-[12px]" />
        <Skeleton className="h-48 w-full rounded-[12px]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-[1240px] mx-auto space-y-6 animate-fadeIn text-slate-900 dark:text-[#f1f3f9]">
      {loadError ? (
        <div className="rounded-[12px] border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {loadError}
        </div>
      ) : null}

      <ProfileHeader
        name={displayName}
        email={session?.user?.email ?? ''}
        headline={headline}
        location={location}
        completion={summary?.completion ?? null}
        needsReview={needsReview}
        onEdit={() => {
          if (summary?.completion.nextAction === 'upload-resume') {
            document
              .getElementById('profile-resume')
              ?.scrollIntoView({ behavior: 'smooth' });
            return;
          }
          identityRef.current?.scrollIntoView({ behavior: 'smooth' });
        }}
        onReview={() =>
          document
            .getElementById('profile-resume')
            ?.scrollIntoView({ behavior: 'smooth' })
        }
      />

      {summary ? (
        <ProfileActivityHeatmap
          days={summary.activity.days}
          totals={summary.activity.totals}
          rangeStart={summary.activity.rangeStart}
          rangeEnd={summary.activity.rangeEnd}
        />
      ) : null}

      <div className="w-full space-y-6" ref={identityRef}>
        {needsReview ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Extracted from your resume — review and confirm. Saving edits keeps
            this unconfirmed until you confirm.
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
        <ProfileResumeCard
          resume={summary?.resume ?? null}
          needsReview={needsReview}
          confirming={confirming}
          onUploaded={() => {
            setReloadKey((count) => count + 1);
          }}
          onConfirm={() => void handleConfirm()}
        />
      </div>
    </div>
  );
}
