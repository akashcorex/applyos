import { describe, expect, it } from 'bun:test';

import { canApplyFromMe } from '../apps/web/src/lib/require-resume';

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
