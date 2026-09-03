// Phase 1 shared input validation — thin compatibility layer over
// `@applyso/validation` (centralized Zod 4.5 contracts).
//
// The exported helpers keep their exact signatures and legacy error strings
// so existing routes and `tests/test_phase1_core.test.ts` keep passing.
// New code should import schemas from `@applyso/validation` directly.

import {
  ALLOWED_RESUME_MIME as ALLOWED_MIME,
  MAX_RESUME_FILE_SIZE as MAX_SIZE,
  firstErrorMessage,
  isValid,
  profileInputSchema,
  resourceIdSchema,
  resumeCreateSchema,
  resumeStatusSchema,
} from '@applyso/validation';

export const ALLOWED_RESUME_MIME = new Set<string>([...ALLOWED_MIME]);

export const MAX_RESUME_FILE_SIZE = MAX_SIZE;

export const RESUME_STATUSES = [
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'ARCHIVED',
] as const;

export type ResumeStatus = (typeof RESUME_STATUSES)[number];

export function isResumeStatus(value: unknown): value is ResumeStatus {
  return isValid(resumeStatusSchema, value);
}

export function isNonEmptyString(
  value: unknown,
  maxLen: number,
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.trim().length <= maxLen
  );
}

export function isValidResourceId(id: unknown): id is string {
  return isValid(resourceIdSchema, id);
}

export function validateResumeCreate(body: Record<string, unknown>):
  | {
      ok: true;
      data: {
        fileName: string;
        storageKey: string;
        mimeType: string;
        fileSize: number;
      };
    }
  | { ok: false; error: string } {
  const result = resumeCreateSchema.safeParse(body);
  if (!result.success) {
    // Preserve legacy error strings for API consumers.
    const message = firstErrorMessage(result.error);
    if (message.startsWith('fileName')) {
      return { ok: false, error: 'fileName is required (max 255 chars)' };
    }
    if (message.startsWith('storageKey')) {
      return { ok: false, error: 'storageKey is required (max 1024 chars)' };
    }
    if (message.startsWith('mimeType')) {
      return { ok: false, error: 'mimeType is not allowed' };
    }
    return {
      ok: false,
      error: 'fileSize must be an integer between 1 and 50MB',
    };
  }
  return { ok: true, data: result.data };
}

export function validateProfileInput(
  body: Record<string, unknown>,
):
  | { ok: true; data: Record<string, string | null> }
  | { ok: false; error: string } {
  const result = profileInputSchema.safeParse(body);
  if (!result.success) {
    const message = firstErrorMessage(result.error);
    const field = message.split(':')[0]?.trim() || 'profile';
    if (field === 'phone') return { ok: false, error: 'Invalid phone' };
    return { ok: false, error: `Invalid ${field}` };
  }
  // Strip absent keys so downstream spreads only carry explicit values.
  const data: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(result.data)) {
    if (typeof value === 'string' || value === null) data[key] = value;
  }
  return { ok: true, data };
}
