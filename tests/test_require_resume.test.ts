import { describe, expect, it } from 'bun:test';

import {
  applyBlockerFromMe,
  canApplyFromMe,
  hasResumeFromMe,
  PROFILE_UNCONFIRMED_ERROR,
  RESUME_REQUIRED_ERROR,
} from '../apps/web/src/lib/require-resume';

describe('canApplyFromMe', () => {
  it('is false without onboarding state', () => {
    expect(canApplyFromMe(null)).toBe(false);
    expect(canApplyFromMe({})).toBe(false);
  });

  it('uses canApply when present', () => {
    expect(
      canApplyFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: false,
          profileConfirmed: false,
          canApply: false,
          onboardingComplete: false,
        },
      }),
    ).toBe(false);
    expect(
      canApplyFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: true,
          profileConfirmed: false,
          canApply: true,
          onboardingComplete: false,
        },
      }),
    ).toBe(true);
  });

  it('falls back to hasResume when canApply is omitted', () => {
    expect(
      canApplyFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: false,
          profileConfirmed: false,
          onboardingComplete: false,
        },
      }),
    ).toBe(true);
    expect(
      canApplyFromMe({
        onboarding: {
          hasResume: false,
          hasProfile: false,
          profileConfirmed: false,
          onboardingComplete: false,
        },
      }),
    ).toBe(false);
  });
});

describe('applyBlockerFromMe', () => {
  it('does not claim a missing resume when onboarding is absent', () => {
    expect(applyBlockerFromMe(null)).toBeNull();
    expect(applyBlockerFromMe({})).toBeNull();
  });

  it('blocks only when hasResume is false', () => {
    expect(
      applyBlockerFromMe({
        onboarding: {
          hasResume: false,
          hasProfile: false,
          profileConfirmed: false,
          canApply: false,
          onboardingComplete: false,
        },
      }),
    ).toEqual({ code: 'RESUME_REQUIRED', error: RESUME_REQUIRED_ERROR });
  });

  it('does not say the resume is missing after upload', () => {
    expect(
      hasResumeFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: true,
          profileConfirmed: false,
          canApply: false,
          onboardingComplete: false,
        },
      }),
    ).toBe(true);
    expect(
      applyBlockerFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: true,
          profileConfirmed: false,
          canApply: false,
          onboardingComplete: false,
        },
      }),
    ).toEqual({
      code: 'PROFILE_UNCONFIRMED',
      error: PROFILE_UNCONFIRMED_ERROR,
    });
  });

  it('allows apply when the resume is present and the profile is confirmed', () => {
    expect(
      applyBlockerFromMe({
        onboarding: {
          hasResume: true,
          hasProfile: true,
          profileConfirmed: true,
          canApply: true,
          onboardingComplete: true,
        },
      }),
    ).toBeNull();
  });
});
