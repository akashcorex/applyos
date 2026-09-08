import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { canAccessOwnerResource } from '../apps/api/src/lib/authz';
import { validateResumeCreate } from '../apps/api/src/lib/phase1-validation';
import {
  EXTRACTION_SCHEMA_VERSION,
  canAgentTransitionStatus,
  canTransitionStatus,
  canUserTransitionStatus,
  extractionToProfileData,
  nextRevisionNumber,
  sanitizeErrorForUser,
  validateEnrichedProfileInput,
  validateExtractionPayload,
} from '../apps/api/src/lib/phase2-validation';

const USER_A = { id: 'user-a', role: 'USER' as const };
const USER_B = { id: 'user-b', role: 'USER' as const };
const ADMIN = { id: 'admin-1', role: 'ADMIN' as const };

const VALID_EXTRACTION = {
  fullName: 'Ada Lovelace',
  email: 'ada@example.com',
  phone: '+1 555-0100',
  location: 'London, UK',
  professionalSummary: 'Pioneering computing engineer.',
  headline: 'Senior Computing Engineer',
  education: [
    {
      institution: 'University of London',
      degree: 'BSc Mathematics',
      fieldOfStudy: 'Mathematics',
      startDate: '2010',
      endDate: '2012',
      graduationDate: '2012',
    },
  ],
  experience: [
    {
      company: 'Analytical Engines Ltd',
      title: 'Senior Engineer',
      location: 'London',
      employmentType: 'Full-time',
      startDate: '2020-01',
      endDate: null,
      description: 'Built computing programs.',
      achievements: ['Published the first algorithm'],
    },
  ],
  skills: [{ name: 'Mathematics', category: 'Technical' }, 'Algorithms'],
  projects: [
    {
      name: 'Bernoulli Engine',
      description: 'Computed Bernoulli numbers.',
      technologies: ['Math'],
      url: 'https://example.com/bernoulli',
    },
  ],
  certifications: [
    {
      name: 'Fellow',
      issuer: 'Royal Society',
      date: '2023',
      credentialId: 'RS-2023',
      url: null,
    },
  ],
  achievements: [{ title: 'First program', description: null, date: null }],
  links: {
    linkedin: 'https://linkedin.com/in/ada',
    github: 'https://github.com/ada',
    portfolio: null,
    others: [],
  },
};

describe('Phase 2 resume upload + ownership', () => {
  it('1. resume upload input is validated', () => {
    expect(
      validateResumeCreate({
        fileName: 'resume.pdf',
        storageKey: 'users/u1/resume.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      }).ok,
    ).toBe(true);
    expect(
      validateResumeCreate({
        fileName: 'x.pdf',
        storageKey: 'k',
        mimeType: 'application/x-sh',
        fileSize: 10,
      }).ok,
    ).toBe(false);
  });

  it('2. resume ownership is enforced (owner only)', () => {
    expect(canAccessOwnerResource(USER_A, 'user-a')).toBe(true);
    expect(canAccessOwnerResource(USER_A, 'user-b')).toBe(false);
  });

  it('10/11. user cannot access another user\u2019s resume or profile', () => {
    expect(canAccessOwnerResource(USER_B, 'user-a')).toBe(false);
    expect(canAccessOwnerResource(USER_A, 'user-b')).toBe(false);
  });

  it('12. admin can access authorized resources', () => {
    expect(canAccessOwnerResource(ADMIN, 'user-a')).toBe(true);
    expect(canAccessOwnerResource(ADMIN, 'user-b')).toBe(true);
  });
});

describe('Phase 2 processing lifecycle', () => {
  it('3. lifecycle transitions follow UPLOADED->PROCESSING->COMPLETED|FAILED', () => {
    expect(canTransitionStatus('UPLOADED', 'PROCESSING')).toBe(true);
    expect(canTransitionStatus('PROCESSING', 'COMPLETED')).toBe(true);
    expect(canTransitionStatus('PROCESSING', 'FAILED')).toBe(true);
    expect(canTransitionStatus('UPLOADED', 'COMPLETED')).toBe(false);
    expect(canTransitionStatus('UPLOADED', 'FAILED')).toBe(false);
    expect(canTransitionStatus('COMPLETED', 'ARCHIVED')).toBe(true);
    expect(canTransitionStatus('ARCHIVED', 'PROCESSING')).toBe(false);
  });

  it('users cannot mark COMPLETED or FAILED', () => {
    expect(canUserTransitionStatus('PROCESSING', 'COMPLETED')).toBe(false);
    expect(canUserTransitionStatus('PROCESSING', 'FAILED')).toBe(false);
    expect(canUserTransitionStatus('UPLOADED', 'ARCHIVED')).toBe(true);
    expect(canAgentTransitionStatus('PROCESSING', 'COMPLETED')).toBe(true);
    expect(canAgentTransitionStatus('UPLOADED', 'COMPLETED')).toBe(true);
    expect(canAgentTransitionStatus('ARCHIVED', 'COMPLETED')).toBe(false);
  });

  it('6. failed extraction is retryable; retry does not skip the pipeline', () => {
    expect(canTransitionStatus('FAILED', 'PROCESSING')).toBe(true);
    expect(canTransitionStatus('FAILED', 'COMPLETED')).toBe(false);
  });

  it('13. processing revisions are sequential (idempotent retry appends)', () => {
    expect(nextRevisionNumber(0)).toBe(1);
    expect(nextRevisionNumber(1)).toBe(2);
    expect(nextRevisionNumber(5)).toBe(6);
  });
});

describe('Phase 2 structured extraction contract', () => {
  it('4. successful extraction validates across all sections', () => {
    const result = validateExtractionPayload(VALID_EXTRACTION);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.fullName).toBe('Ada Lovelace');
      expect(result.data.education).toHaveLength(1);
      expect(result.data.experience).toHaveLength(1);
      expect(result.data.skills.length).toBeGreaterThanOrEqual(2);
      expect(result.data.projects).toHaveLength(1);
      expect(result.data.certifications).toHaveLength(1);
      expect(result.data.achievements).toHaveLength(1);
      expect(result.data.links.linkedin).toBe('https://linkedin.com/in/ada');
    }
  });

  it('5. failures sanitize internals (never leak secrets)', () => {
    const safe = sanitizeErrorForUser({
      code: 'BOOM',
      message: 'postgres://secret internal stack trace',
    });
    expect(safe.code).toBe('BOOM');
    expect(safe.message).not.toContain('postgres');
    expect(safe.message).not.toContain('stack trace');
  });

  it('7. invalid AI output is rejected (never persisted blindly)', () => {
    // Missing required identity.
    expect(validateExtractionPayload({ email: 'a@b.com' }).ok).toBe(false);
    expect(validateExtractionPayload({ fullName: 'Ada' }).ok).toBe(false);
    // Bad email / url / phone.
    expect(
      validateExtractionPayload({ ...VALID_EXTRACTION, email: 'nope' }).ok,
    ).toBe(false);
    expect(
      validateExtractionPayload({
        ...VALID_EXTRACTION,
        links: {
          linkedin: 'javascript:alert(1)',
          github: null,
          portfolio: null,
          others: [],
        },
      }).ok,
    ).toBe(false);
    expect(
      validateExtractionPayload({ ...VALID_EXTRACTION, phone: 'not-a-phone!!' })
        .ok,
    ).toBe(false);
    // Non-object payloads.
    expect(validateExtractionPayload(null).ok).toBe(false);
    expect(validateExtractionPayload([]).ok).toBe(false);
  });

  it('14. legacy resume-agent shapes still validate (snake_case aliases)', () => {
    const legacy = {
      full_name: 'Grace Hopper',
      email: 'grace@example.com',
      phone: null,
      location: null,
      summary: 'Compiler pioneer.',
      preferred_role: 'Systems Engineer',
      skills: ['COBOL'],
      education: [{ degree: 'PhD', school: 'Yale', year: 1934 }],
      work_history: [
        {
          company: 'Navy',
          title: 'Rear Admiral',
          start_date: '1943',
          end_date: null,
          highlights: ['Built the first compiler'],
        },
      ],
      preferred_locations: [],
    };
    const result = validateExtractionPayload(legacy);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.headline).toBe('Systems Engineer');
      expect(result.data.education[0]?.institution).toBe('Yale');
      expect(result.data.experience[0]?.achievements).toEqual([
        'Built the first compiler',
      ]);
    }
  });

  it('missing info stays missing (never fabricated)', () => {
    const result = validateExtractionPayload({
      fullName: 'No Details',
      email: 'nodetails@example.com',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.phone).toBeNull();
      expect(result.data.education).toEqual([]);
      expect(result.data.experience).toEqual([]);
      expect(result.data.skills).toEqual([]);
      expect(result.data.links.linkedin).toBeNull();
    }
  });
});

describe('Phase 2 profile enrichment', () => {
  it('8. extraction populates the profile draft (unconfirmed)', () => {
    const parsed = validateExtractionPayload(VALID_EXTRACTION);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const profile = extractionToProfileData(
      parsed.data,
      EXTRACTION_SCHEMA_VERSION,
      'file-1',
    ) as Record<string, unknown>;
    expect(profile.fullName).toBe('Ada Lovelace');
    expect(profile.isConfirmed).toBe(false);
    expect(profile.sourceResumeFileId).toBe('file-1');
    expect(profile.skills).toContain('Mathematics');
  });

  it('9. user can review/edit extracted information', () => {
    expect(
      validateEnrichedProfileInput({
        fullName: 'Ada L.',
        headline: 'Staff Engineer',
        skills: ['Mathematics', 'Leadership'],
      }).ok,
    ).toBe(true);
    // Partial saves only carry explicit keys.
    const partial = validateEnrichedProfileInput({ fullName: 'Ada L.' });
    expect(partial.ok).toBe(true);
    if (partial.ok) {
      expect(partial.data).toEqual({ fullName: 'Ada L.' });
    }
    // Invalid edits rejected.
    expect(
      validateEnrichedProfileInput({ linkedinUrl: 'javascript:alert(1)' }).ok,
    ).toBe(false);
    expect(validateEnrichedProfileInput({ phone: 'not-a-phone!!' }).ok).toBe(
      false,
    );
    expect(
      validateEnrichedProfileInput({
        education: [{ degree: 'BSc' }],
      }).ok,
    ).toBe(false);
  });
});

describe('Phase 2 Prisma-only architecture (schema contract)', () => {
  const schemaPath = join(
    import.meta.dir,
    '..',
    'packages',
    'database',
    'prisma',
    'schema.prisma',
  );
  const schema = readFileSync(schemaPath, 'utf8');
  const migrationPath = join(
    import.meta.dir,
    '..',
    'packages',
    'database',
    'prisma',
    'migrations',
    '01_init',
    'migration.sql',
  );
  const migration = readFileSync(migrationPath, 'utf8');

  it('15a. Prisma covers the full resume domain (no second system)', () => {
    for (const model of [
      'model Resume ',
      'model ResumeFile ',
      'model ResumeExtraction ',
      'model ResumeVariant ',
      'model ResumeSourceDocument ',
      'model ResumeIrRevision ',
      'model ResumeTailoringPatch ',
      'model ResumeArtifact ',
      'model VariantVersion ',
    ]) {
      expect(schema).toContain(model);
    }
  });

  it('15b. Prisma covers workflows/matching/preferences/analytics', () => {
    for (const model of [
      'model WorkflowRun ',
      'model WorkflowJob ',
      'model Application ',
      'model AgentTask ',
      'model WorkflowEvent ',
      'model MatchSession ',
      'model MatchInteraction ',
      'model UserPreferences ',
      'model AnalyticsEvent ',
      'model LinkedinConnect ',
    ]) {
      expect(schema).toContain(model);
    }
    expect(schema).not.toContain('model EarlyAccessEmail ');
    expect(schema).not.toContain('model OutreachEmail ');
  });

  it('15c. Profile enrichment + lifecycle columns exist', () => {
    expect(schema).toMatch(/model Profile[\s\S]*?isConfirmed/);
    expect(schema).toMatch(/model Profile[\s\S]*?headline/);
    expect(schema).toMatch(/model ResumeFile[\s\S]*?processedAt/);
    expect(schema).toMatch(/model ResumeFile[\s\S]*?errorCode/);
    expect(schema).toMatch(/model ResumeFile[\s\S]*?idempotencyKey/);
  });

  it('16. baseline migration creates tables and never drops', () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect(migration).toContain('CREATE TABLE "resume_extractions"');
    expect(migration).toContain('CREATE TABLE "resumes"');
    expect(migration).not.toMatch(/DROP TABLE/i);
    const createResumes = migration.indexOf('CREATE TABLE "resumes"');
    const fk = migration.indexOf('resume_files_resumeId_fkey');
    expect(createResumes).toBeGreaterThan(-1);
    expect(fk).toBeGreaterThan(createResumes);
    expect(migration).toMatch(
      /CREATE TABLE "resume_extractions"[\s\S]*DEFAULT 'PROCESSING'/,
    );
  });

  it('Drizzle is fully removed (Prisma is the only ORM)', () => {
    const pkg = JSON.parse(
      readFileSync(
        join(import.meta.dir, '..', 'packages', 'database', 'package.json'),
        'utf8',
      ),
    ) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect('drizzle-orm' in (pkg.dependencies ?? {})).toBe(false);
    expect('drizzle-kit' in (pkg.devDependencies ?? {})).toBe(false);
    expect(
      existsSync(
        join(import.meta.dir, '..', 'packages', 'database', 'src', 'schema'),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(import.meta.dir, '..', 'packages', 'database', 'src', 'client.ts'),
      ),
    ).toBe(false);
    expect(
      existsSync(
        join(
          import.meta.dir,
          '..',
          'packages',
          'database',
          'drizzle.config.ts',
        ),
      ),
    ).toBe(false);
  });
});
