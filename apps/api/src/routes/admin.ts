import { Router } from 'express';

import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';
import { requirePermission } from '../lib/permissions';
import { isValidResourceId } from '../lib/phase1-validation';

export const adminRouter = Router();

// Every admin route requires authentication, then a per-route capability.
// Server-side authorization only — UI hiding is never the security boundary.
adminRouter.use(requireAuth);

const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  emailVerified: true,
  image: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function recordAuditLog(
  actorId: string,
  action: string,
  targetUserId: string,
  meta: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actorId, action, targetUserId, meta: meta as never },
    });
  } catch {
    // best-effort; never block the admin mutation on audit failure
  }
}

// GET /v1/admin/users?limit=&offset=&role=&status=
adminRouter.get('/users', requirePermission('users:read'), async (req, res) => {
  const q = req.query as Record<string, unknown>;
  const limitRaw = Array.isArray(q.limit) ? q.limit[0] : q.limit;
  const offsetRaw = Array.isArray(q.offset) ? q.offset[0] : q.offset;
  const limit = Math.min(
    Math.max(Number.parseInt(String(limitRaw ?? '20'), 10) || 20, 1),
    100,
  );
  const offset = Math.max(
    Number.parseInt(String(offsetRaw ?? '0'), 10) || 0,
    0,
  );

  const where: {
    role?: 'USER' | 'ADMIN';
    status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  } = {};
  const roleRaw = Array.isArray(q.role) ? q.role[0] : q.role;
  const statusRaw = Array.isArray(q.status) ? q.status[0] : q.status;
  if (roleRaw === 'USER' || roleRaw === 'ADMIN') where.role = roleRaw;
  else if (roleRaw !== undefined) {
    res.status(400).json({ error: 'Invalid role filter' });
    return;
  }
  if (
    statusRaw === 'ACTIVE' ||
    statusRaw === 'SUSPENDED' ||
    statusRaw === 'DELETED'
  ) {
    where.status = statusRaw;
  } else if (statusRaw !== undefined) {
    res.status(400).json({ error: 'Invalid status filter' });
    return;
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: PUBLIC_USER_SELECT,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
  ]);
  res.status(200).json({ total, limit, offset, users });
});

// GET /v1/admin/users/:id — inspect user + profile + resumes (+ extractions).
adminRouter.get(
  '/users/:id',
  requirePermission('users:read'),
  async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        ...PUBLIC_USER_SELECT,
        profile: true,
        resumeFiles: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          include: {
            extractions: { orderBy: { revisionNumber: 'desc' }, take: 3 },
          },
        },
      },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.status(200).json({
      user,
      profile: user.profile,
      resumes: user.resumeFiles,
    });
  },
);

// GET /v1/admin/resumes?limit=&offset=&status= — inspect processing queue.
adminRouter.get(
  '/resumes',
  requirePermission('resumes:read:all'),
  async (req, res) => {
    const q = req.query as Record<string, unknown>;
    const limitRaw = Array.isArray(q.limit) ? q.limit[0] : q.limit;
    const offsetRaw = Array.isArray(q.offset) ? q.offset[0] : q.offset;
    const limit = Math.min(
      Math.max(Number.parseInt(String(limitRaw ?? '20'), 10) || 20, 1),
      100,
    );
    const offset = Math.max(
      Number.parseInt(String(offsetRaw ?? '0'), 10) || 0,
      0,
    );
    const statusRaw = Array.isArray(q.status) ? q.status[0] : q.status;
    const where =
      statusRaw === 'UPLOADED' ||
      statusRaw === 'PROCESSING' ||
      statusRaw === 'COMPLETED' ||
      statusRaw === 'FAILED' ||
      statusRaw === 'ARCHIVED'
        ? { status: statusRaw as 'UPLOADED' }
        : {};
    if (statusRaw !== undefined && Object.keys(where).length === 0) {
      res.status(400).json({ error: 'Invalid status filter' });
      return;
    }
    const [total, resumes] = await Promise.all([
      prisma.resumeFile.count({ where }),
      prisma.resumeFile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: {
          extractions: {
            orderBy: { revisionNumber: 'desc' },
            take: 1,
            select: {
              revisionNumber: true,
              status: true,
              schemaVersion: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);
    res.status(200).json({ total, limit, offset, resumes });
  },
);

// GET /v1/admin/resumes/:id — inspect resume + full extraction history + owner.
adminRouter.get(
  '/resumes/:id',
  requirePermission('resumes:read:all'),
  async (req, res) => {
    const { id } = req.params;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid resume id' });
      return;
    }
    const resume = await prisma.resumeFile.findUnique({
      where: { id },
      include: {
        extractions: { orderBy: { revisionNumber: 'desc' } },
        user: { select: PUBLIC_USER_SELECT },
      },
    });
    if (!resume) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }
    const profile = await prisma.profile.findUnique({
      where: { userId: resume.userId },
    });
    res.status(200).json({ resume, extractions: resume.extractions, profile });
  },
);

// PATCH /v1/admin/users/:id — role / account status (RBAC mutations).
adminRouter.patch(
  '/users/:id',
  requirePermission('users:write'),
  async (req, res) => {
    const { id } = req.params;
    if (!id || typeof id !== 'string' || id.trim() === '') {
      res.status(400).json({ error: 'Invalid user id' });
      return;
    }
    const actor = authUserOf(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const data: {
      role?: 'USER' | 'ADMIN';
      status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
    } = {};
    if (body.role !== undefined) {
      if (body.role !== 'USER' && body.role !== 'ADMIN') {
        res.status(400).json({ error: 'Invalid role' });
        return;
      }
      data.role = body.role;
    }
    if (body.status !== undefined) {
      if (
        body.status !== 'ACTIVE' &&
        body.status !== 'SUSPENDED' &&
        body.status !== 'DELETED'
      ) {
        res.status(400).json({ error: 'Invalid status' });
        return;
      }
      data.status = body.status;
    }
    if (Object.keys(data).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }
    // Admins cannot change their own role or status — a second admin must do it.
    if (actor.id === id) {
      res
        .status(403)
        .json({ error: 'Admins cannot change their own role or status' });
      return;
    }
    const existing = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true },
    });
    if (!existing) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (existing.role === 'ADMIN' && data.role === 'USER') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        res.status(409).json({ error: 'Cannot demote the last admin' });
        return;
      }
    }
    // Keep Better Auth ban fields in sync with our AccountStatus and revoke
    // live sessions so suspension/role changes take effect immediately.
    const mutatingData: Record<string, unknown> = { ...data };
    if (data.status === 'SUSPENDED' || data.status === 'DELETED') {
      mutatingData.banned = true;
      mutatingData.banReason =
        data.status === 'SUSPENDED' ? 'Suspended by admin' : 'Account deleted';
      mutatingData.banExpires = null;
    } else if (data.status === 'ACTIVE') {
      mutatingData.banned = false;
      mutatingData.banReason = null;
      mutatingData.banExpires = null;
    }
    const user = await prisma.user.update({
      where: { id },
      data: mutatingData,
      select: PUBLIC_USER_SELECT,
    });
    if (data.status !== undefined || data.role !== undefined) {
      await prisma.session.deleteMany({ where: { userId: id } });
    }
    await recordAuditLog(actor.id, 'admin.user.updated', id, {
      changes: data,
      previous: { role: existing.role, status: existing.status },
    });
    res.status(200).json({ user });
  },
);
