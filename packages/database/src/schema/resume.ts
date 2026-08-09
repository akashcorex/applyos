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
    profileEmbedding: jsonb('profile_embedding'),
    profileTextHash: text('profile_text_hash'),
    lastMatchIntent: text('last_match_intent'),
    /** Persistent editable profile — improvements compound across job variants. */
    baseProfile: jsonb('base_profile'),
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

export const resumeVariants = pgTable(
  'resume_variants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dedupKey: text('dedup_key').notNull(),
    jobTitle: text('job_title'),
    companyName: text('company_name'),
    jobDescription: text('job_description'),
    status: text('status').notNull().default('draft'),
    content: jsonb('content').notNull(),
    suggestions: jsonb('suggestions').default([]).notNull(),
    filePath: text('file_path'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resume_variants_resume_id').on(table.resumeId),
    index('idx_resume_variants_user_id').on(table.userId),
    index('idx_resume_variants_dedup').on(table.resumeId, table.dedupKey),
  ],
);

export const variantVersions = pgTable(
  'variant_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => resumeVariants.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    contentSnapshot: jsonb('content_snapshot').notNull(),
    changeReason: text('change_reason').notNull().default('save'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_variant_versions_variant_id').on(table.variantId)],
);
