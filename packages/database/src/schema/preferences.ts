import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { applications } from './workflows';

/** Per-user product toggles. Outreach side effects stay off until explicitly enabled. */
export const userPreferences = pgTable('user_preferences', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  postApplyLinkedinConnectEnabled: boolean(
    'post_apply_linkedin_connect_enabled',
  )
    .notNull()
    .default(false),
  emailOutreachEnabled: boolean('email_outreach_enabled')
    .notNull()
    .default(false),
  autoSubmitEnabled: boolean('auto_submit_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const outreachEmailStatuses = ['queued', 'sent', 'failed'] as const;

export type OutreachEmailStatus = (typeof outreachEmailStatuses)[number];

/** Audit log for opt-in email delivery. Nothing is sent without user enablement. */
export const outreachEmails = pgTable(
  'outreach_emails',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id').references(() => applications.id, {
      onDelete: 'set null',
    }),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    provider: text('provider').notNull(),
    status: text('status').notNull().default('queued'),
    errorDetail: text('error_detail'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_outreach_emails_user_created_at').on(
      table.userId,
      table.createdAt,
    ),
  ],
);
