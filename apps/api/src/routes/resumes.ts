import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';

import { Router } from 'express';
import multer from 'multer';

import { prisma } from '@applyso/database';

import { authUserOf, requireAuth } from '../lib/authz';
import {
  ALLOWED_RESUME_MIME,
  MAX_RESUME_FILE_SIZE,
  isNonEmptyString,
  isResumeStatus,
  isValidResourceId,
  validateResumeCreate,
} from '../lib/phase1-validation';
import {
  EXTRACTION_SCHEMA_VERSION,
  PARSER_VERSION_DEFAULT,
  canAgentTransitionStatus,
  canTransitionStatus,
  canUserTransitionStatus,
  extractionToProfileData,
  isLifecycleStatus,
  nextRevisionNumber,
  sanitizeErrorForUser,
  validateEnrichedProfileInput,
  validateExtractionPayload,
} from '../lib/phase2-validation';
import { readResumeUpload, resolveSafeUploadPath, saveResumeUpload, sniffResumeMime, statResumeUpload } from '../lib/resume-storage';
import { requireServiceToken } from '../lib/service-token';

import type { ResumeLifecycleStatus } from '../lib/phase2-validation';

const LEGACY_RESUME_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_FILE_SIZE },
});

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 'P2002' || code === '23505';
}

/** Best-effort product analytics — never blocks the request, never PII-heavy. */
async function trackResumeEvent(
  eventName: string,
  userId: string | null,
  properties: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.analyticsEvent.create({
      data: {
        eventId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        eventName,
        feature: 'resume',
        userId,
        anonymousId: 'server_anonymous',
        sessionId: 'server_session',
        source: 'server',
        properties: properties as never,
        context: { platform: 'node' } as never,
        environment:
          process.env.NODE_ENV === 'production' ? 'production' : 'development',
        timestamp: new Date(),
      },
    });
  } catch {
    // Analytics must never fail a resume request.
  }
}

async function markFailed(
  resumeFileId: string,
  userId: string,
  input: { code?: unknown; message?: unknown },
): Promise<void> {
  const safe = sanitizeErrorForUser(input);
  const resume = await prisma.resumeFile.findUnique({
    where: { id: resumeFileId },
  });
  if (!resume) return;
  if (!canAgentTransitionStatus(resume.status, 'FAILED')) return;

  const open = await prisma.resumeExtraction.findFirst({
    where: { resumeFileId, status: 'PROCESSING' },
    orderBy: { revisionNumber: 'desc' },
  });
  const count = await prisma.resumeExtraction.count({
    where: { resumeFileId },
  });

  await prisma.$transaction([
    prisma.resumeFile.update({
      where: { id: resumeFileId },
      data: {
        status: 'FAILED',
        failedAt: new Date(),
        errorCode: safe.code,
        errorMessage: safe.message,
        version: { increment: 1 },
      },
    }),
    open
      ? prisma.resumeExtraction.update({
          where: { id: open.id },
          data: {
            status: 'FAILED',
            errorCode: safe.code,
            errorMessage: safe.message,
            payload: {},
          },
        })
      : prisma.resumeExtraction.create({
          data: {
            resumeFileId,
            userId,
            revisionNumber: nextRevisionNumber(count),
            schemaVersion: EXTRACTION_SCHEMA_VERSION,
            parserVersion: resume.parserVersion ?? PARSER_VERSION_DEFAULT,
            extractionVersion: EXTRACTION_SCHEMA_VERSION,
            status: 'FAILED',
            payload: {},
            errorCode: safe.code,
            errorMessage: safe.message,
          },
        }),
  ]);
  await trackResumeEvent('resume_processing_failed', userId, {
    resume_file_id: resumeFileId,
    error_code: safe.code,
  });
}

async function dispatchExtract(resume: {
  id: string;
  userId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
}): Promise<void> {
  const agentUrl = process.env.RESUME_AGENT_URL ?? 'http://127.0.0.1:8005';
  const token = process.env.AGENT_SERVICE_TOKEN;
  if (!token) {
    await markFailed(resume.id, resume.userId, {
      code: 'DISPATCH_FAILED',
      message: 'AGENT_SERVICE_TOKEN is not set',
    });
    return;
  }

  let bytes: Buffer;
  try {
    bytes = await readResumeUpload(resume.storageKey);
  } catch {
    await markFailed(resume.id, resume.userId, {
      code: 'EMPTY_FILE',
      message: 'Uploaded file could not be read',
    });
    return;
  }

  const form = new FormData();
  form.append(
    'file',
    new Blob([bytes], { type: resume.mimeType }),
    resume.fileName,
  );
  form.append('resume_file_id', resume.id);
  form.append('user_id', resume.userId);

  try {
    const res = await fetch(`${agentUrl.replace(/\/$/, '')}/internal/extract`, {
      method: 'POST',
      headers: { 'X-Agent-Service-Token': token },
      body: form,
      signal: AbortSignal.timeout(180000),
    });
    if (!res.ok) {
      await markFailed(resume.id, resume.userId, {
        code: 'EXTRACTION_FAILED',
        message: `resume-agent returned ${res.status}`,
      });
    }
  } catch (error) {
    await markFailed(resume.id, resume.userId, {
      code: 'TIMEOUT',
      message: error instanceof Error ? error.message : 'dispatch failed',
    });
  }
}

async function beginProcessing(
  resume: {
    id: string;
    userId: string;
    status: ResumeLifecycleStatus;
    parserVersion: string | null;
    storageKey: string;
    fileName: string;
    mimeType: string;
  },
  opts?: { retry?: boolean },
): Promise<{
  resume: unknown;
  extraction: unknown;
  started: boolean;
}> {
  if (resume.status === 'PROCESSING') {
    const open = await prisma.resumeExtraction.findFirst({
      where: { resumeFileId: resume.id, status: 'PROCESSING' },
      orderBy: { revisionNumber: 'desc' },
    });
    return { resume, extraction: open, started: false };
  }

  const count = await prisma.resumeExtraction.count({
    where: { resumeFileId: resume.id },
  });
  const [updated, extraction] = await prisma.$transaction([
    prisma.resumeFile.update({
      where: { id: resume.id },
      data: {
        status: 'PROCESSING',
        failedAt: opts?.retry ? null : undefined,
        errorCode: null,
        errorMessage: null,
        version: { increment: 1 },
      },
    }),
    prisma.resumeExtraction.create({
      data: {
        resumeFileId: resume.id,
        userId: resume.userId,
        revisionNumber: nextRevisionNumber(count),
        schemaVersion: EXTRACTION_SCHEMA_VERSION,
        parserVersion: resume.parserVersion ?? PARSER_VERSION_DEFAULT,
        extractionVersion: EXTRACTION_SCHEMA_VERSION,
        status: 'PROCESSING',
        payload: {},
      },
    }),
  ]);
  await trackResumeEvent('resume_processing_started', resume.userId, {
    resume_file_id: resume.id,
    revision: extraction.revisionNumber,
    retry: opts?.retry === true,
  });
  void dispatchExtract({
    id: updated.id,
    userId: updated.userId,
    storageKey: updated.storageKey,
    fileName: updated.fileName,
    mimeType: updated.mimeType,
  });
  return { resume: updated, extraction, started: true };
}

export const resumesInternalRouter = Router();

export const resumesRouter = Router();
resumesRouter.use(requireAuth);

// GET /v1/resumes — list OWN resumes only. Never accepts a userId param.
resumesRouter.get('/', async (req, res) => {
  const me = authUserOf(req);
  const limitRaw = Array.isArray(req.query.limit)
    ? req.query.limit[0]
    : req.query.limit;
  const limit = Math.min(
    Math.max(Number.parseInt(String(limitRaw ?? '50'), 10) || 50, 1),
    100,
  );
  const resumes = await prisma.resumeFile.findMany({
    where: { userId: me.id, deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      resume: {
        select: {
          id: true,
          fullName: true,
          email: true,
          preferredRole: true,
          experienceYears: true,
          skills: true,
        },
      },
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
  });
  res.status(200).json({ resumes });
});

// POST /v1/resumes — create OWN resume metadata (version starts at 1).
resumesRouter.post('/', async (req, res) => {
  const me = authUserOf(req);
  const parsed = validateResumeCreate(
    (req.body ?? {}) as Record<string, unknown>,
  );
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const idempotencyKey =
    typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim()
      ? body.idempotencyKey.trim().slice(0, 128)
      : undefined;

  if (idempotencyKey) {
    const existing = await prisma.resumeFile.findUnique({
      where: { userId_idempotencyKey: { userId: me.id, idempotencyKey } },
    });
    if (existing) {
      res.status(200).json({ resume: existing, deduplicated: true });
      return;
    }
  }

  try {
    const resume = await prisma.resumeFile.create({
      data: {
        userId: me.id,
        status: 'UPLOADED',
        version: 1,
        parserVersion: PARSER_VERSION_DEFAULT,
        extractionVersion: EXTRACTION_SCHEMA_VERSION,
        ...parsed.data,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    });
    await trackResumeEvent('resume_uploaded', me.id, {
      resume_file_id: resume.id,
      mime_type: resume.mimeType,
    });
    res.status(201).json({ resume });
  } catch (error) {
    if (isUniqueViolation(error) && idempotencyKey) {
      const existing = await prisma.resumeFile.findUnique({
        where: { userId_idempotencyKey: { userId: me.id, idempotencyKey } },
      });
      if (existing) {
        res.status(200).json({ resume: existing, deduplicated: true });
        return;
      }
    }
    throw error;
  }
});

// POST /v1/resumes/upload — multipart file + metadata, then kick off process.
resumesRouter.post(
  '/upload',
  (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        res.status(400).json({ error: 'file is required or exceeds 50MB' });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const me = authUserOf(req);
    const file = (
      req as typeof req & {
        file?: {
          originalname: string;
          mimetype: string;
          size: number;
          buffer: Buffer;
        };
      }
    ).file;
    if (!file?.buffer?.length) {
      res.status(400).json({ error: 'file is required' });
      return;
    }
    if (!ALLOWED_RESUME_MIME.has(file.mimetype)) {
      res.status(400).json({ error: 'mimeType is not allowed' });
      return;
    }
    // Never trust the client-supplied MIME alone — verify magic bytes and
    // reject mismatches (polyglots / parser confusion downstream).
    const sniffed = sniffResumeMime(file.buffer);
    if (!sniffed || !ALLOWED_RESUME_MIME.has(sniffed)) {
      res.status(415).json({ error: 'File content does not match its type' });
      return;
    }
    if (sniffed !== file.mimetype) {
      res.status(415).json({ error: 'File content does not match mimeType' });
      return;
    }

    const fileName = file.originalname.trim().slice(0, 255) || 'resume.pdf';
    const resumeFileId = randomUUID();
    const storageKey = await saveResumeUpload({
      userId: me.id,
      resumeFileId,
      fileName,
      mimeType: file.mimetype,
      bytes: file.buffer,
    });

    const resume = await prisma.resumeFile.create({
      data: {
        id: resumeFileId,
        userId: me.id,
        fileName,
        storageKey,
        mimeType: file.mimetype,
        fileSize: file.size,
        status: 'UPLOADED',
        version: 1,
        parserVersion: PARSER_VERSION_DEFAULT,
        extractionVersion: EXTRACTION_SCHEMA_VERSION,
      },
    });
    await trackResumeEvent('resume_uploaded', me.id, {
      resume_file_id: resume.id,
      mime_type: resume.mimeType,
    });

    const started = await beginProcessing({
      id: resume.id,
      userId: resume.userId,
      status: resume.status,
      parserVersion: resume.parserVersion,
      storageKey: resume.storageKey,
      fileName: resume.fileName,
      mimeType: resume.mimeType,
    });
    res.status(202).json({
      resume: started.resume,
      extraction: started.extraction,
    });
  },
);

// GET /v1/resumes/:id — ownership enforced server-side (IDOR protection).
resumesRouter.get('/:id', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({
    where: { id },
    include: {
      extractions: { orderBy: { revisionNumber: 'desc' }, take: 5 },
      resume: {
        select: {
          experienceYears: true,
          preferredRole: true,
          preferredLocations: true,
        },
      },
    },
  });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  res.status(200).json({ resume });
});

// PATCH /v1/resumes/:id — fileName or ARCHIVED only (never COMPLETED/FAILED).
resumesRouter.patch('/:id', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({ where: { id } });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const data: {
    fileName?: string;
    status?: ResumeLifecycleStatus;
  } = {};
  if (body.fileName !== undefined) {
    if (!isNonEmptyString(body.fileName, 255)) {
      res.status(400).json({ error: 'Invalid fileName' });
      return;
    }
    data.fileName = (body.fileName as string).trim();
  }
  if (body.status !== undefined) {
    if (!isResumeStatus(body.status) || !isLifecycleStatus(body.status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    if (!canUserTransitionStatus(resume.status, body.status)) {
      res.status(409).json({
        error: `Cannot transition from ${resume.status} to ${body.status}`,
      });
      return;
    }
    data.status = body.status;
  }
  if (Object.keys(data).length === 0) {
    res.status(400).json({ error: 'Nothing to update' });
    return;
  }
  const updated = await prisma.resumeFile.update({
    where: { id },
    data: {
      ...data,
      ...(data.status === 'ARCHIVED' ? { deletedAt: new Date() } : {}),
      version: { increment: 1 },
    },
  });
  res.status(200).json({ resume: updated });
});

// GET /v1/resumes/:id/status — lightweight processing status for polling UX.
resumesRouter.get('/:id/status', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      status: true,
      version: true,
      processedAt: true,
      failedAt: true,
      errorCode: true,
      errorMessage: true,
      parserVersion: true,
      extractionVersion: true,
      updatedAt: true,
    },
  });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  const { userId: _owner, ...status } = resume;
  res.status(200).json({ status });
});

// GET /v1/resumes/:id/file — stream OWN resume file (IDOR protected).
resumesRouter.get('/:id/file', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({ where: { id } });
  if (!resume || resume.deletedAt || resume.status === 'ARCHIVED') {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  try {
    const download = req.query.download === '1';
    // Containment: a compromised/legacy storageKey must never read
    // arbitrary files as the node user.
    const safePath = resolveSafeUploadPath(resume.storageKey);
    if (!safePath) {
      res.status(404).json({ error: 'Resume file not found' });
      return;
    }
    res.setHeader('Content-Type', resume.mimeType || 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // Prefer on-disk size (no buffering); fall back to the stored column.
    const onDisk = await statResumeUpload(resume.storageKey);
    const length = onDisk ?? (typeof resume.fileSize === 'number' ? resume.fileSize : null);
    if (length !== null) res.setHeader('Content-Length', String(length));
    const safeName = resume.fileName.replace(/["\r\n]/g, '').slice(0, 200);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${safeName}"`,
    );
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200);
    createReadStream(safePath)
      .on('error', () => {
        if (!res.headersSent) res.status(404).json({ error: 'Resume file not found' });
        else res.end();
      })
      .pipe(res);
  } catch {
    res.status(404).json({ error: 'Resume file not found' });
  }
});

// GET /v1/resumes/:id/extraction — latest extraction result (validated only).
resumesRouter.get('/:id/extraction', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({
    where: { id },
    select: { id: true, userId: true },
  });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  const extraction = await prisma.resumeExtraction.findFirst({
    where: { resumeFileId: id, status: 'COMPLETED' },
    orderBy: { revisionNumber: 'desc' },
  });
  if (!extraction) {
    res.status(404).json({ error: 'No completed extraction yet' });
    return;
  }
  res.status(200).json({ extraction });
});

// POST /v1/resumes/:id/process — UPLOADED|FAILED|COMPLETED -> PROCESSING.
resumesRouter.post('/:id/process', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({ where: { id } });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (!canTransitionStatus(resume.status, 'PROCESSING')) {
    res.status(409).json({
      error: `Cannot process from status ${resume.status}`,
    });
    return;
  }
  const started = await beginProcessing({
    id: resume.id,
    userId: resume.userId,
    status: resume.status,
    parserVersion: resume.parserVersion,
    storageKey: resume.storageKey,
    fileName: resume.fileName,
    mimeType: resume.mimeType,
  });
  res.status(started.started ? 202 : 200).json({
    resume: started.resume,
    extraction: started.extraction,
    deduplicated: !started.started,
  });
});

// POST /v1/resumes/:id/retry — FAILED -> PROCESSING only.
resumesRouter.post('/:id/retry', async (req, res) => {
  const me = authUserOf(req);
  const { id } = req.params;
  if (!isValidResourceId(id)) {
    res.status(400).json({ error: 'Invalid resume id' });
    return;
  }
  const resume = await prisma.resumeFile.findUnique({ where: { id } });
  if (!resume) {
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.userId !== me.id) {
    // 404 (not 403) — avoids leaking whether an ID exists to non-owners.
    res.status(404).json({ error: 'Resume not found' });
    return;
  }
  if (resume.status !== 'FAILED') {
    res.status(409).json({
      error: `Only FAILED resumes can be retried (current: ${resume.status})`,
    });
    return;
  }
  const started = await beginProcessing(
    {
      id: resume.id,
      userId: resume.userId,
      status: resume.status,
      parserVersion: resume.parserVersion,
      storageKey: resume.storageKey,
      fileName: resume.fileName,
      mimeType: resume.mimeType,
    },
    { retry: true },
  );
  res.status(202).json({
    resume: started.resume,
    extraction: started.extraction,
  });
});

// ---------------------------------------------------------------------------
// Service boundary: resume-agent callbacks (server-to-server only).
// ---------------------------------------------------------------------------

resumesInternalRouter.post(
  '/internal/:id/complete',
  requireServiceToken,
  async (req, res) => {
    const { id } = req.params;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid resume id' });
      return;
    }
    const resume = await prisma.resumeFile.findUnique({ where: { id } });
    if (!resume) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }
    if (!canAgentTransitionStatus(resume.status, 'COMPLETED')) {
      res.status(409).json({
        error: `Cannot complete from status ${resume.status}`,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const validated = validateExtractionPayload(body.extraction ?? body);
    if (!validated.ok) {
      const safe = sanitizeErrorForUser({
        code: 'EXTRACTION_FAILED',
        message: validated.error,
      });
      await markFailed(id, resume.userId, {
        code: 'INVALID_EXTRACTION',
        message: validated.error,
      });
      res
        .status(422)
        .json({ error: 'Invalid extraction output', code: safe.code });
      return;
    }

    const extraction = validated.data;
    const open = await prisma.resumeExtraction.findFirst({
      where: { resumeFileId: id, status: 'PROCESSING' },
      orderBy: { revisionNumber: 'desc' },
    });
    const count = await prisma.resumeExtraction.count({
      where: { resumeFileId: id },
    });
    const revision = open?.revisionNumber ?? nextRevisionNumber(count);
    const profileData = extractionToProfileData(
      extraction,
      EXTRACTION_SCHEMA_VERSION,
      id,
    );
    const existingProfile = await prisma.profile.findUnique({
      where: { userId: resume.userId },
    });

    const legacyResumeId =
      typeof body.resumeId === 'string' &&
      LEGACY_RESUME_UUID.test(body.resumeId)
        ? body.resumeId
        : undefined;

    await prisma.$transaction([
      open
        ? prisma.resumeExtraction.update({
            where: { id: open.id },
            data: {
              schemaVersion: EXTRACTION_SCHEMA_VERSION,
              parserVersion:
                typeof body.parserVersion === 'string'
                  ? body.parserVersion.slice(0, 64)
                  : (resume.parserVersion ?? PARSER_VERSION_DEFAULT),
              extractionVersion: EXTRACTION_SCHEMA_VERSION,
              status: 'COMPLETED',
              payload: extraction as unknown as never,
              errorCode: null,
              errorMessage: null,
            },
          })
        : prisma.resumeExtraction.create({
            data: {
              resumeFileId: id,
              userId: resume.userId,
              revisionNumber: revision,
              schemaVersion: EXTRACTION_SCHEMA_VERSION,
              parserVersion:
                typeof body.parserVersion === 'string'
                  ? body.parserVersion.slice(0, 64)
                  : (resume.parserVersion ?? PARSER_VERSION_DEFAULT),
              extractionVersion: EXTRACTION_SCHEMA_VERSION,
              status: 'COMPLETED',
              payload: extraction as unknown as never,
            },
          }),
      prisma.resumeFile.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          processedAt: new Date(),
          failedAt: null,
          errorCode: null,
          errorMessage: null,
          extractionVersion: EXTRACTION_SCHEMA_VERSION,
          version: { increment: 1 },
          ...(legacyResumeId ? { resumeId: legacyResumeId } : {}),
        },
      }),
      existingProfile?.isConfirmed
        ? prisma.profile.update({
            where: { userId: resume.userId },
            data: {
              lastExtractedAt: new Date(),
              extractionVersion: EXTRACTION_SCHEMA_VERSION,
              sourceResumeFileId: id,
            },
          })
        : prisma.profile.upsert({
            where: { userId: resume.userId },
            create: { userId: resume.userId, ...profileData },
            update: { ...profileData },
          }),
    ]);

    validateEnrichedProfileInput({
      fullName: extraction.fullName,
      headline: extraction.headline,
    });

    await trackResumeEvent('resume_processing_completed', resume.userId, {
      resume_file_id: id,
      revision,
      skill_count: extraction.skills.length,
    });
    await trackResumeEvent('profile_extracted', resume.userId, {
      resume_file_id: id,
      revision,
    });
    res.status(200).json({ ok: true, revision });
  },
);

resumesInternalRouter.post(
  '/internal/:id/fail',
  requireServiceToken,
  async (req, res) => {
    const { id } = req.params;
    if (!isValidResourceId(id)) {
      res.status(400).json({ error: 'Invalid resume id' });
      return;
    }
    const resume = await prisma.resumeFile.findUnique({ where: { id } });
    if (!resume) {
      res.status(404).json({ error: 'Resume not found' });
      return;
    }
    if (!canAgentTransitionStatus(resume.status, 'FAILED')) {
      res.status(409).json({
        error: `Cannot fail from status ${resume.status}`,
      });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    await markFailed(id, resume.userId, {
      code: body.code ?? body.errorCode,
      message: body.message ?? body.error,
    });
    const updated = await prisma.resumeFile.findUnique({ where: { id } });
    res.status(200).json({ resume: updated });
  },
);
