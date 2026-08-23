import { describe, expect, it } from 'bun:test';

import {
  agentTaskIdempotencyKey,
  applicationIdempotencyKey,
} from '../apps/api/src/lib/idempotency';

describe('workflow idempotency keys', () => {
  it('keeps application and agent-task keys aligned', () => {
    const applicationKey = applicationIdempotencyKey(
      'user-1',
      'acme::123',
      'variant-9',
    );
    expect(applicationKey).toBe('user-1:acme::123:variant-9');
    expect(agentTaskIdempotencyKey(applicationKey)).toBe(
      'user-1:acme::123:variant-9:apply',
    );
  });

  it('uses original when a variant was not tailored', () => {
    expect(applicationIdempotencyKey('user-1', 'acme::123')).toBe(
      'user-1:acme::123:original',
    );
    expect(applicationIdempotencyKey('user-1', 'acme::123', null)).toBe(
      'user-1:acme::123:original',
    );
  });
});
