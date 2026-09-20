import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

/**
 * Avatar files live inside the same uploads root as resumes
 * (`RESUME_UPLOADS_DIR ?? <cwd>/uploads`) under an `avatars/` subfolder, one
 * folder per user, a single current file per user. Local filesystem now;
 * the storage key model maps 1:1 onto R2/S3 keys later.
 */
const AVATARS_ROOT = join(
  process.env.RESUME_UPLOADS_DIR ?? join(process.cwd(), 'uploads'),
  'avatars',
);

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024; // 2 MB

export const AVATAR_MIME_EXT: Record<string, string> = {
  'image/webp': '.webp',
  'image/png': '.png',
  'image/jpeg': '.jpg',
};

async function avatarsRoot(): Promise<string> {
  // Fail loud — never silently fork writes between two roots.
  await mkdir(AVATARS_ROOT, { recursive: true });
  return AVATARS_ROOT;
}

function safeSegment(value: string): string {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return cleaned.slice(0, 128) || 'unknown';
}

/** Sniff magic bytes — never trust the client-supplied MIME alone. */
export function sniffAvatarMime(
  bytes: Buffer,
): keyof typeof AVATAR_MIME_EXT | null {
  if (bytes.length < 12) return null;
  // PNG: 89 50 4E 47
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  // WebP: "RIFF" .... "WEBP"
  if (
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export async function saveAvatar(args: {
  userId: string;
  fileId: string;
  mimeType: string;
  bytes: Buffer;
}): Promise<string> {
  const dir = join(await avatarsRoot(), safeSegment(args.userId));
  await mkdir(dir, { recursive: true });
  const ext = AVATAR_MIME_EXT[args.mimeType] ?? '.webp';
  const fileName = `${args.fileId}${ext}`;
  const finalPath = join(dir, fileName);
  // Crash-safe: write temp + atomic rename first, so a crash/ENOSPC never
  // leaves the user with zero avatar. Only then remove the previous file(s).
  const tmpPath = `${finalPath}.tmp-${args.fileId}`;
  try {
    await writeFile(tmpPath, args.bytes);
    await rename(tmpPath, finalPath);
  } catch (error) {
    await rm(tmpPath, { force: true }).catch(() => {});
    throw error;
  }
  try {
    const entries = await readdir(dir);
    await Promise.all(
      entries
        .filter((entry) => entry !== fileName)
        .map((entry) => rm(join(dir, entry), { force: true })),
    );
  } catch {
    // Cleanup is best-effort — the new avatar is already in place.
  }
  return fileName;
}

export async function readAvatarPath(
  userId: string,
  fileName: string,
): Promise<string | null> {
  // fileName comes from user.image — sanitize to a bare filename so it can
  // never escape the user's avatar directory.
  const safe = safeSegment(fileName);
  if (safe !== fileName || fileName.includes('..')) return null;
  const dir = join(await avatarsRoot(), safeSegment(userId));
  const resolved = resolve(dir, safe);
  // Containment: the resolved path must stay inside the avatars root —
  // guards against legacy/compromised rows.
  const root = resolve(AVATARS_ROOT);
  if (resolved !== root && !resolved.startsWith(`${root}/`)) return null;
  return resolved;
}

export async function removeAvatarFiles(userId: string): Promise<void> {
  const dir = join(await avatarsRoot(), safeSegment(userId));
  try {
    const entries = await readdir(dir);
    await Promise.all(entries.map((entry) => rm(join(dir, entry))));
  } catch {
    // No directory yet — nothing to remove.
  }
}
