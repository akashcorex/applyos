import * as z from 'zod';

import {
  applicationEventCreateSchema,
  interventionCreateSchema,
} from './applications';
import { billingPaymentMethodSchema } from './billing';
import { earlyAccessSubscribeSchema } from './early-access';
import { jobApplySchema, jobIngestSchema, jobSearchSchema } from './jobs';
import { linkedinConnectBulkSchema } from './linkedin';
import { outreachEmailCreateSchema, outreachSendSchema } from './outreach';
import { preferencesUpdateSchema } from './preferences';
import { profileInputSchema } from './profile';
import { resumeCreateSchema, resumeUpdateSchema } from './resume';
import {
  workflowStartSchema,
  workflowStatusUpdateSchema,
} from './workflows';

/**
 * Python bridge. The FastAPI agents (job-agent, resume-agent, …) own their
 * Pydantic models; this module exports the TS-side contracts as JSON Schema
 * (Zod 4 `z.toJSONSchema`, draft 2020-12) so cross-language drift can be
 * diffed in CI and Python tests can validate sample payloads against the
 * same shapes the TypeScript boundary enforces.
 *
 * Regenerate the checked-in snapshot with:
 * `bun --filter @applyso/validation snapshot-json-schema`
 */
export const contractSchemas = {
  earlyAccessSubscribe: earlyAccessSubscribeSchema,
  profileInput: profileInputSchema,
  resumeCreate: resumeCreateSchema,
  resumeUpdate: resumeUpdateSchema,
  preferencesUpdate: preferencesUpdateSchema,
  interventionCreate: interventionCreateSchema,
  applicationEventCreate: applicationEventCreateSchema,
  workflowStart: workflowStartSchema,
  workflowStatusUpdate: workflowStatusUpdateSchema,
  outreachEmailCreate: outreachEmailCreateSchema,
  outreachSend: outreachSendSchema,
  linkedinConnectBulk: linkedinConnectBulkSchema,
  jobIngest: jobIngestSchema,
  jobSearch: jobSearchSchema,
  jobApply: jobApplySchema,
  billingPaymentMethod: billingPaymentMethodSchema,
} as const;

export type ContractName = keyof typeof contractSchemas;

export function contractJsonSchema(name: ContractName) {
  // Schemas intentionally use transforms/pipes for normalization
  // (trim, lowercase, '' → null), which have no JSON Schema equivalent —
  // emit `any` for those nodes so the snapshot still documents every field.
  return z.toJSONSchema(contractSchemas[name], {
    target: 'draft-7',
    unrepresentable: 'any',
  });
}

export function allContractJsonSchemas(): Record<ContractName, unknown> {
  return Object.fromEntries(
    (Object.keys(contractSchemas) as ContractName[]).map((name) => [
      name,
      contractJsonSchema(name),
    ]),
  ) as Record<ContractName, unknown>;
}
