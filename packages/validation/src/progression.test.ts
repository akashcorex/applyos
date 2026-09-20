import { describe, expect, test } from 'bun:test';

import {
  ACHIEVEMENT_DEFINITIONS,
  LINK_XP,
  computeProgression,
  levelForXp,
  tierForLevel,
  xpForLevel,
} from './progression.js';

const EMPTY_INPUT = {
  hasResume: false,
  identityComplete: false,
  preferencesComplete: false,
  profileComplete: false,
  applications: 0,
  interviews: 0,
  offers: 0,
  longestStreak: 0,
};

describe('level curve', () => {
  test('matches the documented anchor points', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(250);
    expect(xpForLevel(4)).toBe(450);
    expect(xpForLevel(5)).toBe(700);
  });

  test('levelForXp inverts xpForLevel at boundaries', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(99)).toBe(1);
    expect(levelForXp(100)).toBe(2);
    expect(levelForXp(249)).toBe(2);
    expect(levelForXp(250)).toBe(3);
    expect(levelForXp(449)).toBe(3);
    expect(levelForXp(450)).toBe(4);
  });

  test('rejects negative and non-finite xp', () => {
    expect(levelForXp(-100)).toBe(1);
    expect(levelForXp(Number.NaN)).toBe(1);
  });

  test('tiers advance with level', () => {
    expect(tierForLevel(1).key).toBe('explorer');
    expect(tierForLevel(4).key).toBe('explorer');
    expect(tierForLevel(5).key).toBe('builder');
    expect(tierForLevel(10).key).toBe('professional');
    expect(tierForLevel(15).key).toBe('specialist');
    expect(tierForLevel(20).key).toBe('expert');
    expect(tierForLevel(99).key).toBe('expert');
  });
});

describe('computeProgression', () => {
  test('empty state is level 1 explorer with nothing earned', () => {
    const result = computeProgression(EMPTY_INPUT);
    expect(result.xp).toBe(0);
    expect(result.level).toBe(1);
    expect(result.tier.key).toBe('explorer');
    expect(result.earnedAchievements).toBe(0);
    expect(result.levelPercent).toBe(0);
    expect(result.nextLevelXp).toBe(100);
  });

  test('earned achievements and links sum into xp', () => {
    const result = computeProgression({
      ...EMPTY_INPUT,
      hasResume: true,
      identityComplete: true,
      githubUrl: 'https://github.com/ada',
      linkedinUrl: 'https://linkedin.com/in/ada',
    });
    // first-upload 100 + identity-complete 100 + 2 links × 50
    expect(result.xp).toBe(200 + 2 * LINK_XP);
    expect(result.level).toBe(3);
    expect(result.tier.key).toBe('explorer');
  });

  test('career milestones earn their achievements', () => {
    const result = computeProgression({
      ...EMPTY_INPUT,
      applications: 10,
      interviews: 1,
    });
    const byKey = Object.fromEntries(
      result.achievements.map((a) => [a.key, a.earned]),
    );
    expect(byKey['first-application']).toBe(true);
    expect(byKey['job-hunter']).toBe(true);
    expect(byKey['interview-ready']).toBe(true);
    expect(byKey['offer-earned']).toBe(false);
    expect(result.xp).toBe(100 + 150 + 250);
  });

  test('level progress stays within the current level span', () => {
    const result = computeProgression({
      ...EMPTY_INPUT,
      hasResume: true,
      identityComplete: true,
      preferencesComplete: true,
      profileComplete: true,
      applications: 50,
      interviews: 2,
      offers: 1,
      longestStreak: 14,
      linkedinUrl: 'x',
      githubUrl: 'x',
      portfolioUrl: 'x',
    });
    const totalAchievementXp = ACHIEVEMENT_DEFINITIONS.reduce(
      (sum, a) => sum + a.xp,
      0,
    );
    expect(result.xp).toBe(totalAchievementXp + 3 * LINK_XP);
    expect(result.intoLevel).toBe(result.xp - xpForLevel(result.level));
    expect(result.levelPercent).toBeGreaterThanOrEqual(0);
    expect(result.levelPercent).toBeLessThan(100);
    expect(result.earnedAchievements).toBe(ACHIEVEMENT_DEFINITIONS.length);
  });

  test('streak achievement needs 7 consecutive days', () => {
    const six = computeProgression({ ...EMPTY_INPUT, longestStreak: 6 });
    const seven = computeProgression({ ...EMPTY_INPUT, longestStreak: 7 });
    expect(six.achievements.find((a) => a.key === 'consistent')?.earned).toBe(
      false,
    );
    expect(seven.achievements.find((a) => a.key === 'consistent')?.earned).toBe(
      true,
    );
  });
});
