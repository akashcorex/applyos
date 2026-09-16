import { describe, expect, it } from 'bun:test';

import {
  asSkillNames,
  buildParsedResumePayload,
} from '../apps/web/src/lib/parsed-resume';

describe('parsed resume helpers', () => {
  it('normalizes skill names from strings and objects', () => {
    expect(asSkillNames(['Python', '  Go  '])).toEqual(['Python', 'Go']);
    expect(asSkillNames([{ name: 'TypeScript' }, { name: ' ' }])).toEqual([
      'TypeScript',
    ]);
  });

  it('builds the auto-apply resume payload from API records', () => {
    const payload = buildParsedResumePayload({
      legacyResumeId: 'legacy-1',
      resumeFileId: 'file-1',
      userId: 'user-1',
      extractionPayload: {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        professionalSummary: 'Backend engineer',
        skills: [{ name: 'Python' }, 'PostgreSQL'],
        education: [{ degree: 'BS' }],
        experience: [{ company: 'Acme', title: 'Engineer' }],
        headline: 'Senior Engineer',
      },
      experienceYears: 5,
      preferredRole: 'Staff Engineer',
      preferredLocations: ['Remote'],
      fileName: 'resume.pdf',
    });

    expect(payload.resume_id).toBe('legacy-1');
    expect(payload.full_name).toBe('Jane Doe');
    expect(payload.skills).toEqual(['Python', 'PostgreSQL']);
    expect(payload.preferred_role).toBe('Staff Engineer');
    expect(payload.work_history).toHaveLength(1);
  });
});
