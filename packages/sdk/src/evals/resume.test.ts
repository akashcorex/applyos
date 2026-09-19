import { describe, expect, it } from 'bun:test';

import { buildResumeEvalState, normalizeResumeEvalResult } from './resume.js';

describe('resume JEV evaluation', () => {
  it('normalizes typed JEV answers into the golden score contract', () => {
    expect(
      normalizeResumeEvalResult({
        answers: {
          no_new_facts: { type: 'boolean', probability: 0.9 },
          evidence_ids_valid: { type: 'boolean', probability: 0.2 },
          operation_allowed: { type: 'boolean', probability: 0.8 },
          skills_relevant: { type: 'score', score: 3 },
        },
      }),
    ).toEqual({
      no_new_facts: true,
      evidence_ids_valid: false,
      operation_allowed: true,
      skills_relevant: 75,
    });
  });

  it('labels all evaluation artifacts in the shared state', () => {
    const state = buildResumeEvalState({
      ir: { id: 'ir-1' },
      job_profile: { title: 'Engineer' },
      proposal: { operations: [] },
    });

    expect(state).toContain('"ResumeIR"');
    expect(state).toContain('"JobProfile"');
    expect(state).toContain('"Proposal"');
  });
});
