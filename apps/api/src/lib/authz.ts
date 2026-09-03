import { fromNodeHeaders } from 'better-auth/node';

import { prisma } from '@applyso/database';

import { auth } from '../auth';

import type { Request, Response, NextFunction } from 'express';

export type Role = 'USER' | 'ADMIN';

export interface SessionUser {
  id: string;
  email: string;
  role: Role;
  status: string;
}

export function toRole(value: unknown): Role {
  return value === 'ADMIN' ? 'ADMIN' : 'USER';
}

export function isAdminRole(role: unknown): boolean {
  return toRole(role) === 'ADMIN';
}

function toAccountStatus(value: unknown, banned?: boolean): string {
  if (banned) return 'SUSPENDED';
  if (value === 'SUSPENDED' || value === 'DELETED' || value === 'ACTIVE') {
    return value;
  }
  return 'ACTIVE';
}

let sessionUserOverride: (() => Promise<SessionUser | null> | SessionUser | null) | null =
  null;

/** Test-only seam so HTTP tests can inject a session without Better Auth. */
export function setSessionUserOverride(
  fn: (() => Promise<SessionUser | null> | SessionUser | null) | null,
): void {
  sessionUserOverride = fn;
}

/** Resolve the Better Auth session for an Express request. Returns null when unauthenticated. */
export async function getSessionUser(
  req: Request,
): Promise<SessionUser | null> {
  if (sessionUserOverride) {
    return sessionUserOverride();
  }
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) return null;
    const u = session.user as unknown as Record<string, unknown>;
    if (typeof u.id !== 'string') return null;
    // Identity comes from the session; authorization comes from the DB row.
    try {
      const row = await prisma.user.findUnique({
        where: { id: u.id },
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          banned: true,
        },
      });
      if (!row) return null;
      return {
        id: row.id,
        email: row.email,
        role: toRole(row.role),
        status: toAccountStatus(row.status, row.banned),
      };
    } catch {
      return {
        id: u.id,
        email: typeof u.email === 'string' ? u.email : '',
        role: toRole(u.role),
        status: toAccountStatus(u.status),
      };
    }
  } catch {
    return null;
  }
}

/** True when `actor` may access a resource owned by `ownerUserId`. Admins bypass ownership. */
export function canAccessOwnerResource(
  actor: Pick<SessionUser, 'id' | 'role'>,
  ownerUserId: string,
): boolean {
  if (actor.role === 'ADMIN') return true;
  return actor.id === ownerUserId;
}

/** Express middleware: requires any authenticated, non-suspended user. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = await getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is not active' });
    return;
  }
  (req as Request & { authUser: SessionUser }).authUser = user;
  next();
}

/** Express middleware: requires an ADMIN user. Must run after requireAuth or standalone. */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const existing = (req as Request & { authUser?: SessionUser }).authUser;
  const user = existing ?? (await getSessionUser(req));
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (user.status !== 'ACTIVE') {
    res.status(403).json({ error: 'Account is not active' });
    return;
  }
  if (!isAdminRole(user.role)) {
    res.status(403).json({ error: 'Forbidden: admin only' });
    return;
  }
  (req as Request & { authUser: SessionUser }).authUser = user;
  next();
}

export function authUserOf(req: Request): SessionUser {
  return (req as Request & { authUser: SessionUser }).authUser;
}
