import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import {
  jobDiscoverSchema,
  jobInteractionSchema,
  jobSelectSchema,
} from '../packages/validation/src/jobs';

const schema = readFileSync(
  join(
    import.meta.dir,
    '..',
    'packages',
    'database',
    'prisma',
    'schema.prisma',
  ),
  'utf8',
);
const migration = readFileSync(
  join(
    import.meta.dir,
    '..',
    'packages',
    'database',
    'prisma',
    'migrations',
    '07_phase2_discovery',
    'migration.sql',
  ),
  'utf8',
);

describe('Phase 2 discovery contracts', () => {
  it('validates bounded discovery input', () => {
    expect(
      jobDiscoverSchema.safeParse({ profileId: 'profile-1', limit: 50 })
        .success,
    ).toBe(true);
    expect(
      jobDiscoverSchema.safeParse({ profileId: 'profile-1', limit: 101 })
        .success,
    ).toBe(false);
  });

  it('rejects selections over ten jobs and duplicate interaction types', () => {
    expect(
      jobSelectSchema.safeParse({
        jobIds: Array.from({ length: 11 }, (_, index) => `job-${index}`),
      }).success,
    ).toBe(false);
    expect(
      jobInteractionSchema.safeParse({
        sessionId: 'session-1',
        eventType: 'apply',
      }).success,
    ).toBe(false);
    expect(
      jobInteractionSchema.safeParse({
        sessionId: 'session-1',
        eventType: 'impression',
        rankPosition: 0,
        matchScore: 87.5,
      }).success,
    ).toBe(true);
  });
});

describe('Phase 2 Prisma discovery contract', () => {
  it('defines canonical discovery entities and workflow linkage', () => {
    expect(schema).toMatch(/model Company[\s\S]*@@map\("companies"\)/);
    expect(schema).toMatch(/model Job[\s\S]*dedupKey\s+String\s+@unique/);
    expect(schema).toMatch(/Job[\s\S]*firstSeenAt[\s\S]*lastSeenAt/);
    expect(schema).toMatch(/model SavedJob[\s\S]*@@unique\(\[userId, jobId\]/);
    expect(schema).toMatch(/model Notification[\s\S]*readAt/);
    expect(schema).toMatch(
      /model JobSelection[\s\S]*items\s+JobSelectionItem\[\]/,
    );
    expect(schema).toMatch(/model JobSelectionItem[\s\S]*jobId\s+String/);
    expect(schema).toMatch(/WorkflowJob[\s\S]*jobId\s+String\?/);
    expect(schema).toMatch(/UserPreferences[\s\S]*dailyLimit\s+Int\?/);
    expect(schema).toMatch(/UserPreferences[\s\S]*minScore\s+Int\?/);
  });

  it('migrates deduplication, timestamps, ownership, and job linkage', () => {
    expect(migration).toContain('"dedup_key" TEXT NOT NULL');
    expect(migration).toContain('"first_seen_at" TIMESTAMPTZ(6)');
    expect(migration).toContain('"last_seen_at" TIMESTAMPTZ(6)');
    expect(migration).toContain('uq_saved_jobs_user_job');
    expect(migration).toContain('workflow_jobs_job_id_fkey');
    expect(migration).toContain('ON DELETE SET NULL');
  });

  it('migrates durable selection ownership and job references', () => {
    const selectionMigration = readFileSync(
      join(
        import.meta.dir,
        '..',
        'packages',
        'database',
        'prisma',
        'migrations',
        '08_phase2_selection',
        'migration.sql',
      ),
      'utf8',
    );
    expect(selectionMigration).toContain('CREATE TABLE "job_selections"');
    expect(selectionMigration).toContain('job_selections_user_id_fkey');
    expect(selectionMigration).toContain('job_selection_items_job_id_fkey');
    expect(selectionMigration).toContain(
      'uq_job_selection_items_selection_job',
    );
  });
});
