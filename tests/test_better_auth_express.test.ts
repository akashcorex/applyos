import { describe, expect, it } from 'bun:test';
import express from 'express';
import type { AddressInfo } from 'node:net';

import { betterAuthExpressHandler } from '../apps/api/src/lib/better-auth-express';

async function listen(
  app: express.Express,
): Promise<{ url: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo | null;
      if (!addr) {
        reject(new Error('no listen address'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () =>
          new Promise((done, fail) =>
            server.close((err) => (err ? fail(err) : done())),
          ),
      });
    });
  });
}

describe('betterAuthExpressHandler', () => {
  it('forwards method, path, cookies, and JSON body to auth.handler', async () => {
    let seen: Request | null = null;
    const app = express();
    app.all(
      '/api/auth/*',
      betterAuthExpressHandler({
        handler: async (request) => {
          seen = request;
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'better-auth.session_token=abc; Path=/',
            },
          });
        },
      }),
    );
    const server = await listen(app);
    try {
      const res = await fetch(`${server.url}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: 'sid=1',
        },
        body: JSON.stringify({ email: 'a@b.co', password: 'secret12' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      expect(res.headers.get('set-cookie')).toContain(
        'better-auth.session_token=abc',
      );
      expect(seen).not.toBeNull();
      expect(seen?.method).toBe('POST');
      expect(new URL(seen!.url).pathname).toBe('/api/auth/sign-up/email');
      expect(seen?.headers.get('cookie')).toBe('sid=1');
      expect(seen?.headers.get('content-type')).toContain('application/json');
      expect(seen?.headers.has('host')).toBe(false);
      expect(await seen?.json()).toEqual({
        email: 'a@b.co',
        password: 'secret12',
      });
    } finally {
      await server.close();
    }
  });

  it('returns 500 JSON when auth.handler throws instead of dropping the socket', async () => {
    const app = express();
    app.all(
      '/api/auth/*',
      betterAuthExpressHandler({
        handler: async () => {
          throw new Error('boom');
        },
      }),
    );
    const server = await listen(app);
    try {
      const res = await fetch(`${server.url}/api/auth/get-session`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Auth handler failed' });
    } finally {
      await server.close();
    }
  });
});
