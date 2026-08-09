import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { resumes } from './resume';

/** One ranked match run (query → scrape → rank). */
export const matchSessions = pgTable(
  'match_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    queryRole: text('query_role').notNull(),
    intentOverride: text('intent_override'),
    jobsScraped: integer('jobs_scraped').default(0).notNull(),
    jobsReturned: integer('jobs_returned').default(0).notNull(),
    companiesScraped: integer('companies_scraped').default(0).notNull(),
    latencyMs: integer('latency_ms'),
    /** Top ranked jobs snapshot: [{ dedup_key, title, company_name, score }] */
    topResults: jsonb('top_results').default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_match_sessions_user_id').on(table.userId),
    index('idx_match_sessions_resume_id').on(table.resumeId),
    index('idx_match_sessions_created_at').on(table.createdAt),
  ],
);

export const matchInteractionTypes = [
  'impression',
  'click',
  'apply',
  'skip',
] as const;

export type MatchInteractionType = (typeof matchInteractionTypes)[number];

/** User actions on a specific job within a match session. */
export const matchInteractions = pgTable(
  'match_interactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => matchSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    dedupKey: text('dedup_key').notNull(),
    jobTitle: text('job_title').notNull(),
    companyName: text('company_name').notNull(),
    eventType: text('event_type').notNull(),
    rankPosition: integer('rank_position'),
    matchScore: real('match_score'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_match_interactions_session_id').on(table.sessionId),
    index('idx_match_interactions_user_id').on(table.userId),
    index('idx_match_interactions_dedup_key').on(table.dedupKey),
    index('idx_match_interactions_event_type').on(table.eventType),
  ],
);
