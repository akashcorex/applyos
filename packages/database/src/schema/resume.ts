import { sql } from 'drizzle-orm';
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
    profileEmbeddingRevisionId: text('profile_embedding_revision_id'),
    embeddingModel: text('embedding_model'),
    embeddingIndexVersion: text('embedding_index_version'),
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
    sourceRevisionId: text('source_revision_id'),
    patchId: text('patch_id'),
    artifactId: text('artifact_id'),
    baselineMatchScore: real('baseline_match_score'),
    matchScore: real('match_score'),
    matchScoreUpdatedAt: timestamp('match_score_updated_at', {
      withTimezone: true,
    }),
    matchScoreMeta: jsonb('match_score_meta'),
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

export const resumeSourceDocuments = pgTable(
  'resume_source_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    fileName: text('file_name'),
    fileType: text('file_type').notNull(),
    storageKey: text('storage_key').notNull(),
    contentSha256: text('content_sha256').notNull(),
    byteSize: integer('byte_size').notNull(),
    parserVersion: text('parser_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resume_source_documents_resume_id').on(table.resumeId),
    index('idx_resume_source_documents_hash').on(table.contentSha256),
  ],
);

export const resumeIrRevisions = pgTable(
  'resume_ir_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    sourceDocumentId: uuid('source_document_id').references(
      () => resumeSourceDocuments.id,
      { onDelete: 'set null' },
    ),
    revisionNumber: integer('revision_number').notNull(),
    schemaVersion: text('schema_version').notNull(),
    payload: jsonb('payload').notNull(),
    sourceDocumentHash: text('source_document_hash').notNull(),
    extractionModel: text('extraction_model'),
    promptVersion: text('prompt_version'),
    promptHash: text('prompt_hash'),
    validation: jsonb('validation').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resume_ir_revisions_resume_id').on(table.resumeId),
    index('idx_resume_ir_revisions_source_hash').on(table.sourceDocumentHash),
  ],
);

export const resumeTailoringPatches = pgTable(
  'resume_tailoring_patches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => resumeVariants.id, {
      onDelete: 'cascade',
    }),
    sourceRevisionId: uuid('source_revision_id')
      .notNull()
      .references(() => resumeIrRevisions.id, { onDelete: 'cascade' }),
    policyVersion: text('policy_version').notNull(),
    payload: jsonb('payload').notNull(),
    diff: jsonb('diff').default({}).notNull(),
    status: text('status').notNull().default('approved'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resume_tailoring_patches_resume_id').on(table.resumeId),
    index('idx_resume_tailoring_patches_variant_id').on(table.variantId),
  ],
);

export const resumeArtifacts = pgTable(
  'resume_artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactHash: text('artifact_hash').notNull().unique(),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    variantId: uuid('variant_id').references(() => resumeVariants.id, {
      onDelete: 'cascade',
    }),
    sourceRevisionId: uuid('source_revision_id')
      .notNull()
      .references(() => resumeIrRevisions.id, { onDelete: 'cascade' }),
    patchId: uuid('patch_id').references(() => resumeTailoringPatches.id, {
      onDelete: 'set null',
    }),
    storageKey: text('storage_key').notNull(),
    mediaType: text('media_type').notNull().default('application/pdf'),
    compilerVersion: text('compiler_version').notNull(),
    templateVersion: text('template_version').notNull(),
    pageCount: integer('page_count'),
    validation: jsonb('validation').default({}).notNull(),
    diff: jsonb('diff').default({}).notNull(),
    provenance: jsonb('provenance').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_resume_artifacts_resume_id').on(table.resumeId),
    index('idx_resume_artifacts_variant_id').on(table.variantId),
    index('idx_resume_artifacts_source_revision_id').on(table.sourceRevisionId),
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
