import { prisma } from '@applyso/database';
import {
  bucketActivityDays,
  computeProfileCompletion,
  computeProgression,
  computeStreaks,
  hasNonEmptyText,
  resolveTimeZone,
  toLocalDateKey,
  trailingHeatmapRange,
  zonedDayStartUtc,
  type ActivityEvent,
  type ProfileActivityKind,
  type ProfileCompletion,
  type ProfileProgression,
} from '@applyso/validation';

const ACTIVE_WORKFLOW = new Set([
  'pending',
  'discovering_funding',
  'discovering',
  'deciding',
  'filtering',
  'applying',
  'paused',
]);

const SUBMITTED_APPLICATION = new Set(['submitted', 'already_applied']);

type ApplicationRow = {
  createdAt: Date;
  submittedAt: Date | null;
  status: string;
  workflowJob: { title: string; companyName: string } | null;
};

type WorkflowRow = {
  createdAt: Date;
  startedAt: Date | null;
  status: string;
};

export interface ProfileLatestResume {
  id: string;
  fileName: string;
  status: string;
  version: number;
  fileSize: number | null;
  mimeType: string | null;
  processedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ProfileTimelineItem {
  at: string;
  kind: ProfileActivityKind;
  label: string;
}

export interface ProfileActivityPayload {
  timeZone: string;
  rangeStart: string;
  rangeEnd: string;
  days: ReturnType<typeof bucketActivityDays>;
  last30Days: { date: string; count: number }[];
  timeline: ProfileTimelineItem[];
  totals: {
    applications: number;
    submitted: number;
    interviews: number;
    offers: number;
    activeWorkflows: number;
    jobsDiscovered: number;
    events: number;
    currentStreak: number;
    longestStreak: number;
  };
}

export interface ProfileSummaryPayload {
  completion: ProfileCompletion;
  progression: ProfileProgression;
  resume: ProfileLatestResume | null;
  activity: ProfileActivityPayload;
}

function pushEvent(
  events: ActivityEvent[],
  at: Date | null | undefined,
  kind: ProfileActivityKind,
  from: Date,
): void {
  if (!at || at < from) return;
  events.push({ at, kind });
}

export async function loadProfileSummary(
  userId: string,
  timeZoneInput: unknown,
  now = new Date(),
): Promise<ProfileSummaryPayload> {
  const timeZone = resolveTimeZone(timeZoneInput);
  const todayKey = toLocalDateKey(now, timeZone);
  const { rangeStart, rangeEnd } = trailingHeatmapRange(todayKey);
  const rangeStartUtc = zonedDayStartUtc(rangeStart, timeZone);

  const [
    profile,
    resumeCount,
    latestResume,
    applicationCount,
    submittedCount,
    interviewCount,
    offerCount,
    activeWorkflowCount,
    jobsDiscoveredCount,
    applications,
    workflows,
    matchSessions,
    resumeFiles,
  ] = await Promise.all([
    prisma.profile.findUnique({
      where: { userId },
      select: {
        isConfirmed: true,
        fullName: true,
        headline: true,
        location: true,
        professionalSummary: true,
        linkedinUrl: true,
        githubUrl: true,
        portfolioUrl: true,
        preferredRoles: true,
        preferredLocations: true,
        workMode: true,
        seniority: true,
      },
    }),
    prisma.resumeFile.count({ where: { userId, deletedAt: null } }),
    prisma.resumeFile.findFirst({
      where: { userId, status: { not: 'ARCHIVED' }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        version: true,
        fileSize: true,
        mimeType: true,
        processedAt: true,
        failedAt: true,
        errorCode: true,
        errorMessage: true,
        createdAt: true,
      },
    }),
    prisma.application.count({ where: { userId } }),
    prisma.application.count({
      where: {
        userId,
        OR: [
          { status: { in: [...SUBMITTED_APPLICATION] } },
          { submittedAt: { not: null } },
        ],
      },
    }),
    prisma.application.count({ where: { userId, outcome: 'interview' } }),
    prisma.application.count({ where: { userId, outcome: 'offer' } }),
    prisma.workflowRun.count({
      where: { userId, status: { in: [...ACTIVE_WORKFLOW] } },
    }),
    prisma.workflowJob.count({ where: { userId } }),
    prisma.application.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: rangeStartUtc } },
          { submittedAt: { gte: rangeStartUtc } },
        ],
      },
      // Bounded: timeline only renders the latest 30 items, so cap rows
      // instead of materializing an unbounded window for power users.
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        createdAt: true,
        submittedAt: true,
        status: true,
        workflowJob: { select: { title: true, companyName: true } },
      },
    }) as Promise<ApplicationRow[]>,
    prisma.workflowRun.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: rangeStartUtc } },
          { startedAt: { gte: rangeStartUtc } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { createdAt: true, startedAt: true, status: true },
    }) as Promise<WorkflowRow[]>,
    prisma.matchSession.findMany({
      where: { userId, createdAt: { gte: rangeStartUtc } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { createdAt: true },
    }),
    prisma.resumeFile.findMany({
      where: { userId, deletedAt: null, createdAt: { gte: rangeStartUtc } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { createdAt: true, processedAt: true, status: true },
    }),
  ]);

  const completion = computeProfileCompletion({
    hasResume: resumeCount > 0,
    hasProfile: profile !== null,
    isConfirmed: profile?.isConfirmed ?? false,
    fullName: profile?.fullName,
    headline: profile?.headline,
    location: profile?.location,
    professionalSummary: profile?.professionalSummary,
    linkedinUrl: profile?.linkedinUrl,
    githubUrl: profile?.githubUrl,
    portfolioUrl: profile?.portfolioUrl,
  });

  const events: ActivityEvent[] = [];
  const timeline: ProfileTimelineItem[] = [];
  const pushTimeline = (
    at: Date | null | undefined,
    kind: ProfileActivityKind,
    label: string,
  ) => {
    if (!at || at < rangeStartUtc) return;
    timeline.push({ at: at.toISOString(), kind, label });
  };
  for (const row of resumeFiles) {
    pushEvent(events, row.createdAt, 'resume', rangeStartUtc);
    pushTimeline(row.createdAt, 'resume', 'Resume uploaded');
    if (row.status === 'COMPLETED') {
      pushEvent(events, row.processedAt, 'resume', rangeStartUtc);
      pushTimeline(row.processedAt, 'resume', 'Resume analyzed');
    }
  }
  for (const row of matchSessions) {
    pushEvent(events, row.createdAt, 'match', rangeStartUtc);
    pushTimeline(row.createdAt, 'match', 'Job match session');
  }
  for (const row of workflows) {
    pushEvent(
      events,
      row.startedAt ?? row.createdAt,
      'workflow',
      rangeStartUtc,
    );
    pushTimeline(row.startedAt ?? row.createdAt, 'workflow', 'Workflow started');
  }
  for (const row of applications) {
    pushEvent(events, row.createdAt, 'application', rangeStartUtc);
    const job = row.workflowJob;
    const target = job ? `${job.title} at ${job.companyName}` : 'a job';
    pushTimeline(row.createdAt, 'application', `Applied to ${target}`);
    pushEvent(events, row.submittedAt, 'application', rangeStartUtc);
    pushTimeline(row.submittedAt, 'application', `Submitted application to ${target}`);
  }
  timeline.sort((a, b) => b.at.localeCompare(a.at));
  timeline.splice(30);

  const days = bucketActivityDays(events, { rangeStart, rangeEnd, timeZone });
  const streaks = computeStreaks(days, todayKey);
  const last30Days = days.slice(-30).map((day) => ({
    date: day.date,
    count: day.count,
  }));

  const progression = computeProgression({
    hasResume: resumeCount > 0,
    identityComplete:
      hasNonEmptyText(profile?.fullName) &&
      hasNonEmptyText(profile?.headline) &&
      hasNonEmptyText(profile?.location) &&
      hasNonEmptyText(profile?.professionalSummary),
    preferencesComplete:
      (profile?.preferredRoles?.length ?? 0) > 0 &&
      (profile?.preferredLocations?.length ?? 0) > 0 &&
      hasNonEmptyText(profile?.workMode) &&
      hasNonEmptyText(profile?.seniority),
    profileComplete: completion.percent === 100,
    linkedinUrl: profile?.linkedinUrl,
    githubUrl: profile?.githubUrl,
    portfolioUrl: profile?.portfolioUrl,
    applications: applicationCount,
    interviews: interviewCount,
    offers: offerCount,
    longestStreak: streaks.longestStreak,
  });

  return {
    completion,
    progression,
    resume: latestResume
      ? {
          ...latestResume,
          fileSize: latestResume.fileSize ?? null,
          mimeType: latestResume.mimeType ?? null,
          processedAt: latestResume.processedAt?.toISOString() ?? null,
          failedAt: latestResume.failedAt?.toISOString() ?? null,
          createdAt: latestResume.createdAt.toISOString(),
        }
      : null,
    activity: {
      timeZone,
      rangeStart,
      rangeEnd,
      days,
      last30Days,
      timeline,
      totals: {
        applications: applicationCount,
        submitted: submittedCount,
        interviews: interviewCount,
        offers: offerCount,
        activeWorkflows: activeWorkflowCount,
        jobsDiscovered: jobsDiscoveredCount,
        events: days.reduce((sum, day) => sum + day.count, 0),
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
      },
    },
  };
}
