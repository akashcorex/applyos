import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: text('event_id').notNull(),
    eventName: text('event_name').notNull(),
    feature: text('feature'),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    anonymousId: text('anonymous_id').notNull(),
    sessionId: text('session_id').notNull(),
    page: text('page'),
    component: text('component'),
    source: text('source').notNull(), // 'client' | 'server'
    properties: jsonb('properties')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    context: jsonb('context')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    environment: text('environment').notNull().default('development'),
    timestamp: timestamp('timestamp', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_analytics_events_event_name_time').on(
      table.eventName,
      table.timestamp,
    ),
    index('idx_analytics_events_feature_time').on(
      table.feature,
      table.timestamp,
    ),
    index('idx_analytics_events_user_id_time').on(
      table.userId,
      table.timestamp,
    ),
    index('idx_analytics_events_session_id').on(table.sessionId),
    index('idx_analytics_events_anonymous_id').on(table.anonymousId),
  ],
);

export const analyticsIdentities = pgTable(
  'analytics_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    anonymousId: text('anonymous_id').notNull(),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    linkedAt: timestamp('linked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_analytics_identities_user_id').on(table.userId),
    index('idx_analytics_identities_anonymous_id').on(table.anonymousId),
  ],
);

export type AnalyticsEventRecord = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;
export type AnalyticsIdentityRecord = typeof analyticsIdentities.$inferSelect;
export type InsertAnalyticsIdentity = typeof analyticsIdentities.$inferInsert;
