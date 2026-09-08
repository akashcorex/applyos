import { prisma } from '@applyso/database';
import {
  bucketActivityDays,
  computeProfileCompletion,
  computeStreaks,
  resolveTimeZone,
  toLocalDateKey,
  trailingHeatmapRange,
  zonedDayStartUtc,
  type ActivityEvent,
  type ProfileActivityKind,
  type ProfileCompletion,
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
  processedAt: string | null;
  failedAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface ProfileActivityPayload {
  timeZone: string;
  rangeStart: string;
  rangeEnd: string;
  days: ReturnType<typeof bucketActivityDays>;
  totals: {
    applications: number;
    submitted: number;
    activeWorkflows: number;
    events: number;
    currentStreak: number;
    longestStreak: number;
  };
}

export interface ProfileSummaryPayload {
  completion: ProfileCompletion;
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
    activeWorkflowCount,
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
      },
    }),
    prisma.resumeFile.count({ where: { userId } }),
    prisma.resumeFile.findFirst({
      where: { userId, status: { not: 'ARCHIVED' } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        status: true,
        version: true,
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
    prisma.workflowRun.count({
      where: { userId, status: { in: [...ACTIVE_WORKFLOW] } },
    }),
    prisma.application.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: rangeStartUtc } },
          { submittedAt: { gte: rangeStartUtc } },
        ],
      },
      select: { createdAt: true, submittedAt: true, status: true },
    }) as Promise<ApplicationRow[]>,
    prisma.workflowRun.findMany({
      where: {
        userId,
        OR: [
          { createdAt: { gte: rangeStartUtc } },
          { startedAt: { gte: rangeStartUtc } },
        ],
      },
      select: { createdAt: true, startedAt: true, status: true },
    }) as Promise<WorkflowRow[]>,
    prisma.matchSession.findMany({
      where: { userId, createdAt: { gte: rangeStartUtc } },
      select: { createdAt: true },
    }),
    prisma.resumeFile.findMany({
      where: { userId, createdAt: { gte: rangeStartUtc } },
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
  for (const row of resumeFiles) {
    pushEvent(events, row.createdAt, 'resume', rangeStartUtc);
    if (row.status === 'COMPLETED') {
      pushEvent(events, row.processedAt, 'resume', rangeStartUtc);
    }
  }
  for (const row of matchSessions) {
    pushEvent(events, row.createdAt, 'match', rangeStartUtc);
  }
  for (const row of workflows) {
    pushEvent(
      events,
      row.startedAt ?? row.createdAt,
      'workflow',
      rangeStartUtc,
    );
  }
  for (const row of applications) {
    pushEvent(events, row.createdAt, 'application', rangeStartUtc);
    pushEvent(events, row.submittedAt, 'application', rangeStartUtc);
  }

  const days = bucketActivityDays(events, { rangeStart, rangeEnd, timeZone });
  const streaks = computeStreaks(days, todayKey);

  return {
    completion,
    resume: latestResume
      ? {
          ...latestResume,
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
      totals: {
        applications: applicationCount,
        submitted: submittedCount,
        activeWorkflows: activeWorkflowCount,
        events: days.reduce((sum, day) => sum + day.count, 0),
        currentStreak: streaks.currentStreak,
        longestStreak: streaks.longestStreak,
      },
    },
  };
}
