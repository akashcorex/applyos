import { describe, expect, it } from 'bun:test';

import { jobIdBelongsToWorkflow } from '../apps/web/src/lib/workflow-authorization';

describe('jobIdBelongsToWorkflow', () => {
  it('requires the workflow id prefix', () => {
    expect(jobIdBelongsToWorkflow('wf-1', 'wf-1:acme::job')).toBe(true);
    expect(jobIdBelongsToWorkflow('wf-1', 'wf-2:acme::job')).toBe(false);
    expect(jobIdBelongsToWorkflow('wf-1', 'wf-1')).toBe(false);
    expect(jobIdBelongsToWorkflow('wf-1', 'wf-10:acme::job')).toBe(false);
  });
});
