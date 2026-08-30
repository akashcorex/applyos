import { describe, expect, it } from 'bun:test';
import { sanitizeProperties, sanitizeText } from '../sanitizer';
import { getOrCreateAnonymousId, getOrCreateSession } from '../session';

describe('Analytics Privacy & Sanitizer', () => {
  it('strips email addresses from raw text', () => {
    const raw = 'Contact user at john.doe@example.com for support';
    const sanitized = sanitizeText(raw);
    expect(sanitized).toBe('Contact user at [MASKED_EMAIL] for support');
  });

  it('strips JWT tokens and secrets', () => {
    const raw =
      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak';
    const sanitized = sanitizeText(raw);
    expect(sanitized).toContain('[MASKED_TOKEN]');
  });

  it('masks sensitive property keys in objects', () => {
    const props = {
      password: 'superSecretPassword',
      token: 'secretToken123',
      valid_metric: 42,
      company_name: 'Stripe',
    };

    const sanitized = sanitizeProperties(props as Record<string, unknown>);
    expect(sanitized).not.toHaveProperty('password');
    expect(sanitized).not.toHaveProperty('token');
    expect(sanitized).toHaveProperty('valid_metric', 42);
    expect(sanitized).toHaveProperty('company_name', 'Stripe');
  });

  it('truncates oversized strings to safe length', () => {
    const longString = 'A'.repeat(300);
    const sanitized = sanitizeText(longString, 50);
    expect(sanitized?.length).toBeLessThanOrEqual(51); // 50 chars + ellipsis
  });
});

describe('Analytics Session & Identity', () => {
  it('generates a valid anonymous ID', () => {
    const anonId = getOrCreateAnonymousId();
    expect(typeof anonId).toBe('string');
    expect(anonId.length).toBeGreaterThan(5);
  });

  it('generates a valid session ID', () => {
    const session = getOrCreateSession();
    expect(typeof session.sessionId).toBe('string');
    expect(session.sessionId.length).toBeGreaterThan(5);
  });
});
