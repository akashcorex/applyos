/**
 * Drift guard: the Zod enum tuples in `enums.ts` must stay identical to the
 * DB-owned tuples in `packages/database/src/enums.ts`. Run with
 * `bun test` inside this package (dev-only; never bundled).
 */
import { describe, expect, test } from 'bun:test';

import {
  applicationEventTypes as dbApplicationEventTypes,
  applicationOutcomes as dbApplicationOutcomes,
  applicationStatuses as dbApplicationStatuses,
  agentTaskStatuses as dbAgentTaskStatuses,
  humanInterventionStatuses as dbHumanInterventionStatuses,
  humanInterventionTypes as dbHumanInterventionTypes,
  workflowEventTypes as dbWorkflowEventTypes,
  workflowJobStatuses as dbWorkflowJobStatuses,
  workflowRunStatuses as dbWorkflowRunStatuses,
  linkedinConnectStatuses as dbLinkedinConnectStatuses,
  billingPlans as dbBillingPlans,
  billingIntervals as dbBillingIntervals,
  billingAddOnPacks as dbBillingAddOnPacks,
  billingSubscriptionStatuses as dbBillingSubscriptionStatuses,
} from '../../database/src/enums.js';

import {
  applicationEventTypes,
  applicationOutcomes,
  applicationStatuses,
  agentTaskStatuses,
  humanInterventionStatuses,
  humanInterventionTypes,
  linkedinConnectStatuses,
  workflowEventTypes,
  workflowJobStatuses,
  workflowRunStatuses,
  billingPlans,
  billingIntervals,
  billingAddOnPacks,
  billingSubscriptionStatuses,
} from './enums.js';

const pairs = {
  workflowRunStatuses: [workflowRunStatuses, dbWorkflowRunStatuses],
  workflowJobStatuses: [workflowJobStatuses, dbWorkflowJobStatuses],
  applicationStatuses: [applicationStatuses, dbApplicationStatuses],
  humanInterventionTypes: [humanInterventionTypes, dbHumanInterventionTypes],
  humanInterventionStatuses: [
    humanInterventionStatuses,
    dbHumanInterventionStatuses,
  ],
  applicationEventTypes: [applicationEventTypes, dbApplicationEventTypes],
  applicationOutcomes: [applicationOutcomes, dbApplicationOutcomes],
  agentTaskStatuses: [agentTaskStatuses, dbAgentTaskStatuses],
  workflowEventTypes: [workflowEventTypes, dbWorkflowEventTypes],
  linkedinConnectStatuses: [linkedinConnectStatuses, dbLinkedinConnectStatuses],
  billingPlans: [billingPlans, dbBillingPlans],
  billingIntervals: [billingIntervals, dbBillingIntervals],
  billingAddOnPacks: [billingAddOnPacks, dbBillingAddOnPacks],
  billingSubscriptionStatuses: [
    billingSubscriptionStatuses,
    dbBillingSubscriptionStatuses,
  ],
} as const;

describe('enum drift vs @applyso/database', () => {
  for (const [name, [local, remote]] of Object.entries(pairs)) {
    test(name, () => {
      expect([...local]).toEqual([...remote]);
    });
  }
});
