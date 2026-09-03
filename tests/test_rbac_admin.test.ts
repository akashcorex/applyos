import { afterAll, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { AddressInfo } from 'node:net';

import express from 'express';

type SessionUser = {
  id: string;
  email: string;
  role: 'USER' | 'ADMIN';
  status: string;
};

let sessionUser: SessionUser | null = null;

const users = [
  {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin',
    emailVerified: true,
    image: null,
    role: 'ADMIN',
    status: 'ACTIVE',
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

const prismaMock = {
  user: {
    findUnique: mock(async () => users[0]),
    findMany: mock(async () => users),
    count: mock(async () => 1),
    update: mock(async () => users[0]),
  },
};

mock.module('@applyso/database', () => ({
  prisma: prismaMock,
}));

const { setSessionUserOverride } = await import('../apps/api/src/lib/authz');
const { adminRouter } = await import('../apps/api/src/routes/admin');
const { meRouter } = await import('../apps/api/src/routes/me');

const app = express();
app.use(express.json());
app.use('/v1/me', meRouter);
app.use('/v1/admin', adminRouter);

const server = app.listen(0);
const port = (server.address() as AddressInfo).port;
const base = `http://127.0.0.1:${port}`;

afterAll(() => {
  setSessionUserOverride(null);
  server.close();
});

beforeEach(() => {
  sessionUser = null;
  setSessionUserOverride(() => sessionUser);
  prismaMock.user.findUnique.mockReset();
  prismaMock.user.findMany.mockReset();
  prismaMock.user.count.mockReset();
  prismaMock.user.update.mockReset();
  prismaMock.user.findUnique.mockResolvedValue(users[0]);
  prismaMock.user.findMany.mockResolvedValue(users);
  prismaMock.user.count.mockResolvedValue(1);
  prismaMock.user.update.mockResolvedValue(users[0]);
});

describe('RBAC: /v1/admin is ADMIN-only', () => {
  it('401 without a session', async () => {
    const res = await fetch(`${base}/v1/admin/users`);
    expect(res.status).toBe(401);
  });

  it('403 for an authenticated USER', async () => {
    sessionUser = {
      id: 'user-a',
      email: 'a@example.com',
      role: 'USER',
      status: 'ACTIVE',
    };
    const res = await fetch(`${base}/v1/admin/users`);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/admin/i);
  });

  it('403 for a suspended ADMIN', async () => {
    sessionUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'SUSPENDED',
    };
    const res = await fetch(`${base}/v1/admin/users`);
    expect(res.status).toBe(403);
  });

  it('200 for an ACTIVE ADMIN', async () => {
    sessionUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    };
    const res = await fetch(`${base}/v1/admin/users`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { users: unknown[] };
    expect(Array.isArray(body.users)).toBe(true);
  });

  it('USER cannot PATCH another user role', async () => {
    sessionUser = {
      id: 'user-a',
      email: 'a@example.com',
      role: 'USER',
      status: 'ACTIVE',
    };
    const res = await fetch(`${base}/v1/admin/users/admin-1`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'ADMIN' }),
    });
    expect(res.status).toBe(403);
    expect(prismaMock.user.update.mock.calls.length).toBe(0);
  });

  it('ADMIN can PATCH status', async () => {
    sessionUser = {
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    };
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-a',
      role: 'USER',
    });
    const res = await fetch(`${base}/v1/admin/users/user-a`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'SUSPENDED' }),
    });
    expect(res.status).toBe(200);
    expect(prismaMock.user.update.mock.calls.length).toBe(1);
  });
});
