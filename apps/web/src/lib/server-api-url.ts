/** Server-side API origin. Prefer API_URL (Vercel) — NEXT_PUBLIC_* may be unset on Edge. */
export function serverApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:5000'
  );
}
