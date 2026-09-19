import { createHash } from 'node:crypto';

import type { JevQuestions } from '../jev.js';

export const resumeQuestions = {
  no_new_facts: {
    type: 'boolean',
    instructions:
      'Compare the proposal with ResumeIR. Every employer, date, metric, skill, and technology in the proposal must exist verbatim or semantically in ResumeIR. Return false for any invention.',
  },
  evidence_ids_valid: {
    type: 'boolean',
    instructions:
      'Compare every proposal evidence_ids value with ResumeIR.evidence and the evidence attached to its target node. Return false if any reference is missing or unsupported.',
  },
  operation_allowed: {
    type: 'boolean',
    instructions:
      'The proposal may use only emphasize_skill, reorder_skill, reorder_experience, and rewrite_existing_bullet. Return false for every other operation.',
  },
  skills_relevant: {
    type: 'score',
    instructions:
      'Compare the skills emphasized or reordered in the proposal with JobProfile.required_skills and JobProfile.preferred_skills. Select the ordered score level that best describes the match.',
    criteria: [
      '0-20: no relevant skills are emphasized',
      '21-40: mostly irrelevant skills are emphasized',
      '41-60: mixed relevance',
      '61-80: mostly relevant skills are emphasized',
      '81-100: the emphasized skills strongly match the job profile',
    ],
  },
} as const satisfies JevQuestions;

export type ResumeQuestions = typeof resumeQuestions;

export interface ResumeEvalInput {
  ir: Record<string, unknown>;
  job_profile: Record<string, unknown>;
  proposal: Record<string, unknown>;
}

export function buildResumeEvalState(input: ResumeEvalInput): string {
  return JSON.stringify(
    {
      ResumeIR: input.ir,
      JobProfile: input.job_profile,
      Proposal: input.proposal,
    },
    null,
    2,
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : undefined;
}

export function normalizeResumeEvalResult(value: unknown): unknown {
  const result = asRecord(value);
  const answers = asRecord(result?.answers ?? result?.result ?? value);
  if (!answers) return value;

  const booleanAnswer = (id: string): boolean | undefined => {
    const answer = asRecord(answers[id]);
    return typeof answer?.probability === 'number'
      ? answer.probability >= 0.5
      : undefined;
  };
  const scoreAnswer = asRecord(answers.skills_relevant);
  const score =
    typeof scoreAnswer?.score === 'number'
      ? Math.round((scoreAnswer.score / 4) * 100)
      : undefined;

  return {
    no_new_facts: booleanAnswer('no_new_facts'),
    evidence_ids_valid: booleanAnswer('evidence_ids_valid'),
    operation_allowed: booleanAnswer('operation_allowed'),
    skills_relevant: score,
  };
}

export function resumePromptHash(): string {
  return createHash('sha256')
    .update(JSON.stringify(resumeQuestions))
    .digest('hex');
}
