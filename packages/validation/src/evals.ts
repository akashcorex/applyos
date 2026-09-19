import * as z from 'zod';

export const evalScoreSchema = z.object({
  no_new_facts: z.boolean(),
  evidence_ids_valid: z.boolean(),
  operation_allowed: z.boolean(),
  skills_relevant: z.number().min(0).max(100),
});

export const evalCaseSchema = z.object({
  id: z.string().min(1),
  ir: z.record(z.string(), z.unknown()),
  job_profile: z.record(z.string(), z.unknown()),
  proposal: z.record(z.string(), z.unknown()),
  expected: evalScoreSchema,
  prompt_hash: z.string().min(1),
});

export const evalReportSchema = z.object({
  case_id: z.string().min(1),
  passed: z.boolean(),
  expected: evalScoreSchema,
  actual: evalScoreSchema.optional(),
  error: z.string().optional(),
});

export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalScore = z.infer<typeof evalScoreSchema>;
export type EvalReport = z.infer<typeof evalReportSchema>;
