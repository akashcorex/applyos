import * as z from 'zod';

export const profileActivityKinds = [
  'resume',
  'match',
  'workflow',
  'application',
] as const;

export type ProfileActivityKind = (typeof profileActivityKinds)[number];

export const profileNextActions = [
  'upload-resume',
  'review',
  'complete',
  'ready',
] as const;

export type ProfileNextAction = (typeof profileNextActions)[number];

export const PROFILE_COMPLETION_ITEMS = [
  {
    key: 'resume',
    label: 'Resume',
    hint: 'Required before you can apply.',
    required: true,
  },
  {
    key: 'fullName',
    label: 'Full name',
    hint: 'Used on applications and cover letters.',
    required: false,
  },
  {
    key: 'headline',
    label: 'Target role',
    hint: 'Improves job matching.',
    required: false,
  },
  {
    key: 'location',
    label: 'Location',
    hint: 'Used for location-aware matching.',
    required: false,
  },
  {
    key: 'professionalSummary',
    label: 'Summary',
    hint: 'Helps agents tailor applications.',
    required: false,
  },
  {
    key: 'linkedinUrl',
    label: 'LinkedIn',
    hint: 'Lets agents attach the right profile.',
    required: false,
  },
  {
    key: 'portfolioLink',
    label: 'GitHub or portfolio',
    hint: 'Adds proof of work to applications.',
    required: false,
  },
] as const;

export type ProfileCompletionKey =
  (typeof PROFILE_COMPLETION_ITEMS)[number]['key'];

export interface ProfileCompletionInput {
  hasResume: boolean;
  fullName?: string | null;
  headline?: string | null;
  location?: string | null;
  professionalSummary?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  isConfirmed?: boolean | null;
  hasProfile?: boolean;
}

export interface ProfileCompletionMissing {
  key: ProfileCompletionKey;
  label: string;
  hint: string;
  required: boolean;
}

export interface ProfileCompletion {
  percent: number;
  filled: number;
  total: number;
  missing: ProfileCompletionMissing[];
  nextAction: ProfileNextAction;
}

export interface ActivityEvent {
  at: Date;
  kind: ProfileActivityKind;
}

export interface ActivityDay {
  date: string;
  count: number;
  kinds: ProfileActivityKind[];
}

export interface ActivityTotals {
  applications: number;
  submitted: number;
  interviews?: number;
  offers?: number;
  activeWorkflows: number;
  jobsDiscovered?: number;
  events: number;
  currentStreak: number;
  longestStreak: number;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function computeProfileCompletion(
  input: ProfileCompletionInput,
): ProfileCompletion {
  const filledKeys = new Set<ProfileCompletionKey>();
  if (input.hasResume) filledKeys.add('resume');
  if (hasNonEmptyText(input.fullName)) filledKeys.add('fullName');
  if (hasNonEmptyText(input.headline)) filledKeys.add('headline');
  if (hasNonEmptyText(input.location)) filledKeys.add('location');
  if (hasNonEmptyText(input.professionalSummary)) {
    filledKeys.add('professionalSummary');
  }
  if (hasNonEmptyText(input.linkedinUrl)) filledKeys.add('linkedinUrl');
  if (hasNonEmptyText(input.githubUrl) || hasNonEmptyText(input.portfolioUrl)) {
    filledKeys.add('portfolioLink');
  }

  const missing: ProfileCompletionMissing[] = PROFILE_COMPLETION_ITEMS.filter(
    (item) => !filledKeys.has(item.key),
  ).map((item) => ({
    key: item.key,
    label: item.label,
    hint: item.hint,
    required: item.required,
  }));

  const total = PROFILE_COMPLETION_ITEMS.length;
  const filled = total - missing.length;
  const percent = Math.round((filled / total) * 100);

  let nextAction: ProfileNextAction = 'ready';
  if (!input.hasResume) nextAction = 'upload-resume';
  else if (input.hasProfile && input.isConfirmed === false) {
    nextAction = 'review';
  } else if (missing.length > 0) nextAction = 'complete';

  return { percent, filled, total, missing, nextAction };
}

export function isValidTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function resolveTimeZone(value: unknown): string {
  if (typeof value === 'string' && isValidTimeZone(value.trim())) {
    return value.trim();
  }
  return 'UTC';
}

export function toLocalDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const lookup = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
}

export function addDateKey(dateKey: string, days: number): string {
  if (!DATE_KEY.test(dateKey)) {
    throw new Error('dateKey must be YYYY-MM-DD');
  }
  const [year, month, day] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function weekdayMonday0(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function trailingHeatmapRange(
  todayKey: string,
  weekCount = 53,
): { rangeStart: string; rangeEnd: string } {
  const rangeEnd = todayKey;
  const lead = weekdayMonday0(todayKey);
  const rangeStart = addDateKey(rangeEnd, -((weekCount - 1) * 7 + lead));
  return { rangeStart, rangeEnd };
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

export function zonedDayStartUtc(dateKey: string, timeZone: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const first = utcGuess - timeZoneOffsetMs(new Date(utcGuess), timeZone);
  return new Date(utcGuess - timeZoneOffsetMs(new Date(first), timeZone));
}

export function enumerateDateKeys(
  rangeStart: string,
  rangeEnd: string,
): string[] {
  const keys: string[] = [];
  let cursor = rangeStart;
  while (cursor <= rangeEnd) {
    keys.push(cursor);
    cursor = addDateKey(cursor, 1);
  }
  return keys;
}

export function bucketActivityDays(
  events: ActivityEvent[],
  range: { rangeStart: string; rangeEnd: string; timeZone: string },
): ActivityDay[] {
  const byDate = new Map<
    string,
    { count: number; kinds: Set<ProfileActivityKind> }
  >();
  for (const key of enumerateDateKeys(range.rangeStart, range.rangeEnd)) {
    byDate.set(key, { count: 0, kinds: new Set() });
  }
  for (const event of events) {
    const date = toLocalDateKey(event.at, range.timeZone);
    const bucket = byDate.get(date);
    if (!bucket) continue;
    bucket.count += 1;
    bucket.kinds.add(event.kind);
  }
  return [...byDate.entries()].map(([date, bucket]) => ({
    date,
    count: bucket.count,
    kinds: profileActivityKinds.filter((kind) => bucket.kinds.has(kind)),
  }));
}

export function computeStreaks(
  days: Pick<ActivityDay, 'date' | 'count'>[],
  todayKey: string,
): { currentStreak: number; longestStreak: number } {
  const active = new Set(
    days.filter((day) => day.count > 0).map((day) => day.date),
  );
  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    if (day.count > 0) {
      run += 1;
      if (run > longestStreak) longestStreak = run;
    } else {
      run = 0;
    }
  }

  let currentStreak = 0;
  let cursor = todayKey;
  if (!active.has(cursor)) {
    cursor = addDateKey(todayKey, -1);
  }
  while (active.has(cursor)) {
    currentStreak += 1;
    cursor = addDateKey(cursor, -1);
  }
  return { currentStreak, longestStreak };
}

export function heatmapLevel(count: number, maxCount = 0): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxCount <= 1) return 4;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export const profileCompletionSchema = z.object({
  percent: z.number().int().min(0).max(100),
  filled: z.number().int().min(0),
  total: z.number().int().min(1),
  missing: z.array(
    z.object({
      key: z.enum(
        PROFILE_COMPLETION_ITEMS.map((item) => item.key) as [
          ProfileCompletionKey,
          ...ProfileCompletionKey[],
        ],
      ),
      label: z.string(),
      hint: z.string(),
      required: z.boolean(),
    }),
  ),
  nextAction: z.enum(profileNextActions),
});

export const activityDaySchema = z.object({
  date: z.string().regex(DATE_KEY),
  count: z.number().int().min(0),
  kinds: z.array(z.enum(profileActivityKinds)),
});

export const profileTimelineItemSchema = z.object({
  at: z.string().min(1),
  kind: z.enum(profileActivityKinds),
  label: z.string(),
});

export const profileActivitySchema = z.object({
  timeZone: z.string().min(1),
  rangeStart: z.string().regex(DATE_KEY),
  rangeEnd: z.string().regex(DATE_KEY),
  days: z.array(activityDaySchema),
  last30Days: z
    .array(
      z.object({
        date: z.string().regex(DATE_KEY),
        count: z.number().int().min(0),
      }),
    )
    .optional(),
  timeline: z.array(profileTimelineItemSchema).optional(),
  totals: z.object({
    applications: z.number().int().min(0),
    submitted: z.number().int().min(0),
    interviews: z.number().int().min(0).optional(),
    offers: z.number().int().min(0).optional(),
    activeWorkflows: z.number().int().min(0),
    jobsDiscovered: z.number().int().min(0).optional(),
    events: z.number().int().min(0),
    currentStreak: z.number().int().min(0),
    longestStreak: z.number().int().min(0),
  }),
});
