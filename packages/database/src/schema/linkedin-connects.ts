import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/** Statuses for post-apply LinkedIn connection invites (step 1). */
export const linkedinConnectStatuses = [
  'queued',
  'sent',
  'failed',
  'already_connected',
  'skipped_rate_limit',
] as const;

export type LinkedinConnectStatus = (typeof linkedinConnectStatuses)[number];

/**
 * Tracks LinkedIn connection requests sent after a job apply.
 * `acceptedAt` is reserved for step 2 (accept tracking → referral DM).
 *
 * `userId` is a plain text key (matches orchestrator/apply-agent user_id),
 * not a hard FK — local flows often use ``default`` before auth is wired.
 */
export const linkedinConnects = pgTable(
  'linkedin_connects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    /** Orchestrator/apply-agent job id string until a jobs table exists. */
    jobId: text('job_id').notNull(),
    companyName: text('company_name').notNull(),
    profileUrl: text('profile_url').notNull(),
    profileName: text('profile_name').notNull(),
    headline: text('headline'),
    status: text('status').notNull().default('queued'),
    errorDetail: text('error_detail'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_linkedin_connects_user_id').on(table.userId),
    index('idx_linkedin_connects_job_id').on(table.jobId),
    uniqueIndex('uq_linkedin_connects_user_job_profile').on(
      table.userId,
      table.jobId,
      table.profileUrl,
    ),
  ],
);
