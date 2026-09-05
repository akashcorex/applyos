/** Frontend origins allowed to call the API (CORS + Better Auth). */
export function webOrigins(): string[] {
  const primary = process.env.WEB_URL ?? 'http://localhost:3000';
  const origins = new Set([primary]);

  try {
    const url = new URL(primary);
    const host = url.hostname;
    if (host.startsWith('www.')) {
      origins.add(`${url.protocol}//${host.slice(4)}`);
    } else if (host !== 'localhost' && !host.endsWith('.localhost')) {
      origins.add(`${url.protocol}//www.${host}`);
    }
  } catch {
    // keep primary only
  }

  return [...origins];
}
