import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    location: text('location'),
    summary: text('summary'),
    experienceYears: integer('experience_years').default(0).notNull(),
    skills: text('skills')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    education: jsonb('education').default([]).notNull(),
    workHistory: jsonb('work_history').default([]).notNull(),
    preferredRole: text('preferred_role'),
    preferredLocations: text('preferred_locations')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    rawText: text('raw_text'),
    fileName: text('file_name'),
    fileType: text('file_type'),
    filePath: text('file_path'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resumes_user_id').on(table.userId),
    index('idx_resumes_skills').using('gin', table.skills),
  ],
);
