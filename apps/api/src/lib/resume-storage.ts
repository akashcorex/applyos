import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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

/**
 * Sniff magic bytes — never trust the client-supplied MIME alone.
 * Returns the detected MIME from the allowlist, or null when unknown.
 * PDF: %PDF, DOCX: ZIP (PK\x03\x04), DOC: OLE (D0 CF 11 E0),
 * TXT: no binary signature but overwhelmingly printable text.
 */
export function sniffResumeMime(bytes: Buffer): string | null {
  if (bytes.length < 4) return null;
  // PDF: 25 50 44 46 ("%PDF")
  if (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  ) {
    return 'application/pdf';
  }
  // ZIP (docx): 50 4B 03 04
  if (
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  ) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  // OLE (legacy .doc): D0 CF 11 E0
  if (
    bytes.length >= 8 &&
    bytes[0] === 0xd0 &&
    bytes[1] === 0xcf &&
    bytes[2] === 0x11 &&
    bytes[3] === 0xe0
  ) {
    return 'application/msword';
  }
  // Plain text: sample the first 512 bytes — reject NUL bytes and require
  // the sample to be overwhelmingly printable ASCII / common whitespace.
  const sample = bytes.subarray(0, 512);
  let printable = 0;
  for (const byte of sample) {
    if (byte === 0x00) return null;
    if (
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x0a ||
      byte === 0x0d ||
      byte === 0x09
    ) {
      printable += 1;
    }
  }
  if (printable / sample.length >= 0.95) return 'text/plain';
  return null;
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
  if (!safe) throw Object.assign(new Error('Resume file not found'), { code: 'ENOENT' });
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
