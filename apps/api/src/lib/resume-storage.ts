import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const UPLOADS_ROOT = join(process.cwd(), 'uploads');

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

export async function saveResumeUpload(args: {
  userId: string;
  resumeFileId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const dir = join(UPLOADS_ROOT, safeSegment(args.userId));
  await mkdir(dir, { recursive: true });
  const ext = extensionFor(args.fileName, args.mimeType);
  const path = join(dir, `${args.resumeFileId}${ext}`);
  await writeFile(path, args.bytes);
  return path;
}

export async function readResumeUpload(storageKey: string): Promise<Buffer> {
  return readFile(storageKey);
}
