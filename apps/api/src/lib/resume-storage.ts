import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { ALLOWED_RESUME_MIME } from './phase1-validation';

const UPLOADS_ROOT =
  process.env.RESUME_UPLOADS_DIR ?? join(process.cwd(), 'uploads');

async function uploadsRoot(): Promise<string> {
  // Fail loud — never silently fork writes between two roots. A transient
  // EACCES/ENOSPC must surface as a 503, not as reads missing later.
  await mkdir(UPLOADS_ROOT, { recursive: true });
  return UPLOADS_ROOT;
}

function safeSegment(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned.slice(0, 128) || 'unknown';
}

export function extensionFor(fileName: string, mimeType: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.docx')) return '.docx';
  if (lower.endsWith('.doc')) return '.doc';
  if (lower.endsWith('.txt')) return '.txt';
  if (mimeType.includes('wordprocessingml')) return '.docx';
  if (mimeType === 'application/msword') return '.doc';
  if (mimeType === 'text/plain') return '.txt';
  return '.pdf';
}

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function sniffResumeMime(bytes: Buffer): string | null {
  if (bytes.length < 4) return null;
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return PDF_MIME;
  }
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return DOCX_MIME;
  }
  return null;
}

export function classifyResumeUpload(input: {
  fileName: string;
  declaredMime: string;
  bytes: Buffer;
}):
  | { ok: true; mimeType: string }
  | { ok: false; status: 400 | 415; error: string } {
  if (input.bytes.length === 0) {
    return { ok: false, status: 400, error: 'file is required' };
  }
  const sniffed = sniffResumeMime(input.bytes);
  if (!sniffed || !ALLOWED_RESUME_MIME.has(sniffed)) {
    return {
      ok: false,
      status: 415,
      error: 'File content is not a supported resume type',
    };
  }
  const declared = input.declaredMime.split(';')[0]?.trim().toLowerCase() ?? '';
  const generic = declared === '' || declared === 'application/octet-stream';
  if (!generic && declared !== sniffed) {
    return {
      ok: false,
      status: 415,
      error: 'File content does not match mimeType',
    };
  }
  const lower = input.fileName.toLowerCase();
  const named = lower.endsWith('.docx')
    ? 'docx'
    : lower.endsWith('.pdf')
      ? 'pdf'
      : '';
  const sniffedKind = sniffed === DOCX_MIME ? 'docx' : 'pdf';
  if (named && named !== sniffedKind) {
    return {
      ok: false,
      status: 415,
      error: 'File name does not match file content',
    };
  }
  return { ok: true, mimeType: sniffed };
}

/**
 * Containment check — a storageKey from the DB must resolve inside the
 * uploads root. Returns the resolved path, or null on escape.
 * Guards against compromised/legacy rows pointing at arbitrary files.
 */
export function resolveSafeUploadPath(storageKey: string): string | null {
  const resolved = resolve(storageKey);
  const root = resolve(UPLOADS_ROOT);
  if (resolved !== root && resolved.startsWith(`${root}/`)) return resolved;
  return null;
}

export async function saveResumeUpload(args: {
  userId: string;
  resumeFileId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const dir = join(await uploadsRoot(), safeSegment(args.userId));
  await mkdir(dir, { recursive: true });
  const ext = extensionFor(args.fileName, args.mimeType);
  const path = join(dir, `${args.resumeFileId}${ext}`);
  await writeFile(path, args.bytes);
  return path;
}

export async function readResumeUpload(storageKey: string): Promise<Buffer> {
  const safe = resolveSafeUploadPath(storageKey);
  if (!safe)
    throw Object.assign(new Error('Resume file not found'), { code: 'ENOENT' });
  return readFile(safe);
}

/** Size on disk without buffering the file — for Content-Length when streaming. */
export async function statResumeUpload(
  storageKey: string,
): Promise<number | null> {
  try {
    const safe = resolveSafeUploadPath(storageKey);
    if (!safe) return null;
    const st = await stat(safe);
    return st.size;
  } catch {
    return null;
  }
}
