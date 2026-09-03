import { Router } from 'express';

import { prisma } from '@applyso/database';

import { requireAdmin } from '../lib/authz';
import { isValidResourceId } from '../lib/phase1-validation';

export const adminRouter = Router();

// Every admin route requires ADMIN role — enforced server-side, never in UI only.
adminRouter.use(requireAdmin);

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

// GET /v1/admin/users?limit=&offset=&role=&status=
adminRouter.get('/users', async (req, res) => {
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
adminRouter.get('/users/:id', async (req, res) => {
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
});

// GET /v1/admin/resumes?limit=&offset=&status= — inspect processing queue.
adminRouter.get('/resumes', async (req, res) => {
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
});

// GET /v1/admin/resumes/:id — inspect resume + full extraction history + owner.
adminRouter.get('/resumes/:id', async (req, res) => {
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
});

// PATCH /v1/admin/users/:id — role / account status (RBAC mutations).
adminRouter.patch('/users/:id', async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || id.trim() === '') {
    res.status(400).json({ error: 'Invalid user id' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: { role?: 'USER' | 'ADMIN'; status?: 'ACTIVE' | 'SUSPENDED' | 'DELETED' } =
    {};
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
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
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
  const user = await prisma.user.update({
    where: { id },
    data,
    select: PUBLIC_USER_SELECT,
  });
  res.status(200).json({ user });
});
