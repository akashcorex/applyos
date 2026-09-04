import { getSessionUser, type Role, type SessionUser } from './authz';

import type { NextFunction, Request, Response } from 'express';

export type Capability =
  | 'account:read:own'
  | 'profile:read:own'
  | 'profile:write:own'
  | 'resumes:read:own'
  | 'resumes:write:own'
  | 'users:read'
  | 'users:write'
  | 'resumes:read:all';

const USER_CAPABILITIES: Capability[] = [
  'account:read:own',
  'profile:read:own',
  'profile:write:own',
  'resumes:read:own',
  'resumes:write:own',
];

const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  USER: USER_CAPABILITIES,
  ADMIN: [
    ...USER_CAPABILITIES,
    'users:read',
    'users:write',
    'resumes:read:all',
  ],
};

export function roleHasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function can(
  actorRole: string | undefined,
  capability: Capability,
): boolean {
  const role: Role = actorRole === 'ADMIN' ? 'ADMIN' : 'USER';
  return roleHasCapability(role, capability);
}

/**
 * Express middleware factory: requires an authenticated, non-suspended user
 * whose role grants `capability`. Authorization always derives from the DB
 * user row (see getSessionUser), never from UI state.
 */
export function requirePermission(capability: Capability) {
  return async function requirePermissionMiddleware(
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
    if (!roleHasCapability(user.role, capability)) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    (req as Request & { authUser: SessionUser }).authUser = user;
    next();
  };
}
