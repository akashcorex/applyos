import { describe, expect, it } from 'bun:test';

import {
  checkPosting,
  isPostingAlive,
  type LivenessCheck,
} from '../apps/web/src/lib/job-liveness';

function pageAfterFailedHead(page: {
  ok: boolean;
  status: number;
  url?: string;
  text?: string;
}): LivenessCheck {
  return async (url: string, init?: RequestInit) => {
    if (init?.method === 'HEAD') {
      return { ok: false, status: 405, url, body: async () => '' };
    }
    return {
      ok: page.ok,
      status: page.status,
      url: page.url ?? url,
      body: async () => page.text ?? '',
    };
  };
}

const LIVE_TEXT = `<html><body>${'Senior Engineer role description. '.repeat(30)}</body></html>`;

describe('isPostingAlive', () => {
  it('accepts a live HEAD response without GET fallback', async () => {
    let gets = 0;
    const fetchFn: LivenessCheck = async (url: string, init?: RequestInit) => {
      if (init?.method === 'GET') gets += 1;
      return { ok: true, status: 200, url, body: async () => '' };
    };
    expect(await isPostingAlive('https://example.com/j/1', fetchFn)).toBe(true);
    expect(gets).toBe(0);
  });

  it('falls back to GET when HEAD fails', async () => {
    const fetchFn: LivenessCheck = async (url: string, init?: RequestInit) =>
      init?.method === 'HEAD'
        ? { ok: false, status: 405, url, body: async () => '' }
        : { ok: true, status: 200, url, body: async () => LIVE_TEXT };
    expect(await isPostingAlive('https://example.com/j/1', fetchFn)).toBe(true);
  });

  it('reports dead when both fail or throw', async () => {
    const throwing: LivenessCheck = async () => {
      throw new Error('network down');
    };
    expect(await isPostingAlive('https://example.com/gone', throwing)).toBe(
      false,
    );
    expect(
      await isPostingAlive(
        'https://example.com/gone',
        pageAfterFailedHead({ ok: false, status: 404 }),
      ),
    ).toBe(false);
  });
});

describe('checkPosting', () => {
  it('flags Greenhouse error redirects as closed', async () => {
    const result = await checkPosting(
      'https://example.com/j/1',
      pageAfterFailedHead({
        ok: true,
        status: 200,
        url: 'https://boards.greenhouse.io/x/jobs/1?error=true',
        text: LIVE_TEXT,
      }),
    );
    expect(result).toEqual({ alive: false, status: 'closed' });
  });

  it('flags expired phrases and thin pages as closed', async () => {
    const expired = await checkPosting(
      'https://example.com/j/1',
      pageAfterFailedHead({
        ok: true,
        status: 200,
        text: 'This job is no longer available, sorry.',
      }),
    );
    expect(expired.status).toBe('closed');
    const thin = await checkPosting(
      'https://example.com/j/2',
      pageAfterFailedHead({ ok: true, status: 200, text: '<html></html>' }),
    );
    expect(thin.status).toBe('closed');
  });

  it('accepts pages with real descriptions', async () => {
    const result = await checkPosting(
      'https://example.com/j/1',
      pageAfterFailedHead({ ok: true, status: 200, text: LIVE_TEXT }),
    );
    expect(result).toEqual({ alive: true, status: 'ok' });
  });
});
