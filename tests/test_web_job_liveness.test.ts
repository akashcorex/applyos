import { describe, expect, it } from 'bun:test';

import { isPostingAlive } from '../apps/web/src/lib/job-liveness';

function stub(
  outcomes: Record<string, { ok: boolean; status: number } | 'throw'>,
) {
  return async (url: string) => {
    const outcome = outcomes[url] ?? outcomes['*'] ?? { ok: true, status: 200 };
    if (outcome === 'throw') throw new Error('network down');
    return outcome;
  };
}

describe('isPostingAlive', () => {
  it('accepts a live HEAD response without GET fallback', async () => {
    let gets = 0;
    const fetchFn = async (url: string, init?: RequestInit) => {
      if (init?.method === 'GET') gets += 1;
      return { ok: true, status: 200 };
    };
    expect(await isPostingAlive('https://example.com/j/1', fetchFn)).toBe(true);
    expect(gets).toBe(0);
  });

  it('falls back to GET when HEAD fails', async () => {
    const fetchFn = async (url: string, init?: RequestInit) =>
      init?.method === 'HEAD'
        ? { ok: false, status: 405 }
        : { ok: true, status: 200 };
    expect(await isPostingAlive('https://example.com/j/1', fetchFn)).toBe(true);
  });

  it('reports dead when both fail or throw', async () => {
    expect(
      await isPostingAlive('https://example.com/gone', stub({ '*': 'throw' })),
    ).toBe(false);
    expect(
      await isPostingAlive(
        'https://example.com/gone',
        stub({ '*': { ok: false, status: 404 } }),
      ),
    ).toBe(false);
  });
});
