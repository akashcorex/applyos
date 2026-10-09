import { afterEach, describe, expect, it } from 'bun:test';

import { POST } from '../apps/web/src/app/api/resume/parse/route';

const originalFetch = globalThis.fetch;
const originalApiUrl = process.env.API_URL;
const originalPublicApiUrl = process.env.NEXT_PUBLIC_API_URL;

function pathOf(input: RequestInfo | URL): string {
  const href =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  return new URL(href).pathname;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalApiUrl === undefined) delete process.env.API_URL;
  else process.env.API_URL = originalApiUrl;
  if (originalPublicApiUrl === undefined)
    delete process.env.NEXT_PUBLIC_API_URL;
  else process.env.NEXT_PUBLIC_API_URL = originalPublicApiUrl;
});

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

describe('POST /api/resume/parse', () => {
  it('rejects an empty upload before calling the API', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      calls.push(pathOf(input));
      return jsonResponse({ user: { id: 'user-1' } });
    }) as typeof fetch;

    const body = new FormData();
    body.append(
      'file',
      new File([], 'resume.pdf', { type: 'application/pdf' }),
    );
    const response = await POST(
      new Request('http://localhost/api/resume/parse', {
        method: 'POST',
        headers: { cookie: 'session=1' },
        body,
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'The uploaded file is empty.',
    });
    expect(calls.some((path) => path.includes('/v1/resumes/upload'))).toBe(
      false,
    );
  });

  it('uses NEXT_PUBLIC_API_URL and returns status errors immediately', async () => {
    delete process.env.API_URL;
    process.env.NEXT_PUBLIC_API_URL = 'http://resume-api.test';
    const calls: string[] = [];
    globalThis.fetch = (async (input) => {
      const href =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(href);
      const path = pathOf(input);
      if (path.endsWith('/api/auth/get-session')) {
        return jsonResponse({ user: { id: 'user-1' } });
      }
      if (path.endsWith('/v1/resumes/upload')) {
        return jsonResponse({ resume: { id: 'file-1' } }, 202);
      }
      if (path.endsWith('/status')) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      return jsonResponse({ error: 'unexpected' }, 500);
    }) as typeof fetch;

    const body = new FormData();
    body.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'resume.pdf', {
        type: 'application/pdf',
      }),
    );
    const response = await POST(
      new Request('http://localhost/api/resume/parse', {
        method: 'POST',
        headers: { cookie: 'session=1' },
        body,
      }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(calls.filter((href) => href.endsWith('/status'))).toHaveLength(1);
    expect(
      calls.some((href) => href === 'http://resume-api.test/v1/resumes/upload'),
    ).toBe(true);
  });

  it('returns the processing failure from the API', async () => {
    globalThis.fetch = (async (input) => {
      const path = pathOf(input);
      if (path.endsWith('/api/auth/get-session')) {
        return jsonResponse({ user: { id: 'user-1' } });
      }
      if (path.endsWith('/v1/resumes/upload')) {
        return jsonResponse({ resume: { id: 'file-1' } }, 202);
      }
      if (path.endsWith('/status')) {
        return jsonResponse({
          status: {
            status: 'FAILED',
            errorMessage: 'No readable text was found in the file.',
          },
        });
      }
      return jsonResponse({ error: 'unexpected' }, 500);
    }) as typeof fetch;

    const body = new FormData();
    body.append(
      'file',
      new File([new Uint8Array([1, 2, 3])], 'resume.pdf', {
        type: 'application/pdf',
      }),
    );
    const response = await POST(
      new Request('http://localhost/api/resume/parse', {
        method: 'POST',
        headers: { cookie: 'session=1' },
        body,
      }),
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: 'No readable text was found in the file.',
    });
  });
});
