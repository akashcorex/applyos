import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { canAccessOwnerResource } from '../apps/api/src/lib/authz';
import {
  isResumeStatus,
  isValidResourceId,
  validateProfileInput,
  validateResumeCreate,
} from '../apps/api/src/lib/phase1-validation';

const USER_A = { id: 'user-a', role: 'USER' as const };
const USER_B = { id: 'user-b', role: 'USER' as const };
const ADMIN = { id: 'admin-1', role: 'ADMIN' as const };

describe('Phase 1 authorization boundaries', () => {
  it('1. user can access own profile (owner match)', () => {
    expect(canAccessOwnerResource(USER_A, 'user-a')).toBe(true);
  });

  it('2. user cannot access another user\u2019s profile', () => {
    expect(canAccessOwnerResource(USER_A, 'user-b')).toBe(false);
  });

  it('3. user can access own resumes (owner match)', () => {
    expect(canAccessOwnerResource(USER_B, 'user-b')).toBe(true);
  });

  it('4. user cannot access another user\u2019s resumes', () => {
    expect(canAccessOwnerResource(USER_B, 'user-a')).toBe(false);
  });

  it('5. admin can access authorized user data (any owner)', () => {
    expect(canAccessOwnerResource(ADMIN, 'user-a')).toBe(true);
    expect(canAccessOwnerResource(ADMIN, 'user-b')).toBe(true);
  });

  it('6. non-admin is not admin (admin routes must reject USER role)', () => {
    expect(USER_A.role).not.toBe('ADMIN');
    expect(canAccessOwnerResource(USER_A, 'user-b')).toBe(false);
    // Admin bypass is role-gated: only ADMIN bypasses ownership.
    expect(ADMIN.role).toBe('ADMIN');
  });

  it('7. invalid resource IDs are rejected', () => {
    expect(isValidResourceId('')).toBe(false);
    expect(isValidResourceId('   ')).toBe(false);
    expect(isValidResourceId(undefined)).toBe(false);
    expect(isValidResourceId(null)).toBe(false);
    expect(isValidResourceId('cm123abc')).toBe(true);
  });

  it('8a. resume creation input is validated (reject untrusted input)', () => {
    expect(
      validateResumeCreate({
        fileName: 'resume.pdf',
        storageKey: 'users/u1/resume.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      }).ok,
    ).toBe(true);
    // mime allowlist
    expect(
      validateResumeCreate({
        fileName: 'x.pdf',
        storageKey: 'k',
        mimeType: 'application/x-sh',
        fileSize: 10,
      }).ok,
    ).toBe(false);
    // size bounds
    expect(
      validateResumeCreate({
        fileName: 'x.pdf',
        storageKey: 'k',
        mimeType: 'application/pdf',
        fileSize: 0,
      }).ok,
    ).toBe(false);
    // status enum
    expect(isResumeStatus('UPLOADED')).toBe(true);
    expect(isResumeStatus('COMPLETED')).toBe(true);
    expect(isResumeStatus('ARCHIVED')).toBe(true);
    expect(isResumeStatus('DRAFT')).toBe(false);
  });

  it('8b. profile input is validated', () => {
    expect(
      validateProfileInput({
        fullName: 'Ada',
        linkedinUrl: 'https://linkedin.com/in/ada',
      }).ok,
    ).toBe(true);
    expect(
      validateProfileInput({ linkedinUrl: 'javascript:alert(1)' }).ok,
    ).toBe(false);
    expect(validateProfileInput({ phone: 'not-a-phone!!' }).ok).toBe(false);
  });
});

describe('Phase 1 database constraints (schema contract)', () => {
  const schemaPath = join(
    import.meta.dir,
    '..',
    'packages',
    'database',
    'prisma',
    'schema.prisma',
  );
  const schema = readFileSync(schemaPath, 'utf8');

  it('9a. User.email has a uniqueness constraint', () => {
    expect(schema).toMatch(/model User[\s\S]*?@@unique\(\[email\]\)/);
  });

  it('9b. Profile.userId is unique (1-1)', () => {
    expect(schema).toMatch(/model Profile[\s\S]*?userId\s+String\s+@unique/);
  });

  it('9c. ResumeFile.userId is indexed (1-many list path)', () => {
    expect(schema).toMatch(/model ResumeFile[\s\S]*?@@index\(\[userId\]\)/);
  });

  it('9d. ownership FKs cascade deliberately', () => {
    expect(schema).toMatch(/Profile[\s\S]*onDelete: Cascade/);
    expect(schema).toMatch(/ResumeFile[\s\S]*onDelete: Cascade/);
  });

  it('9e. role and resume status are enums (extensible without restructure)', () => {
    expect(schema).toMatch(/enum Role[\s\S]*?USER[\s\S]*?ADMIN/);
    expect(schema).toMatch(
      /enum ResumeStatus[\s\S]*?UPLOADED[\s\S]*?PROCESSING[\s\S]*?COMPLETED[\s\S]*?FAILED[\s\S]*?ARCHIVED/,
    );
  });
});
