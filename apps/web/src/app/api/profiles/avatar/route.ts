import { requireUserId } from '@/lib/require-user';
import { serverApiUrl } from '@/lib/server-api-url';

function cookieHeader(request: Request): HeadersInit {
  const cookie = request.headers.get('cookie');
  return cookie ? { cookie } : {};
}

// GET /api/profiles/avatar — stream the current user's uploaded photo.
export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const res = await fetch(`${serverApiUrl()}/v1/profiles/me/avatar`, {
      headers: cookieHeader(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return Response.json(data, { status: res.status });
    }
    const buffer = await res.arrayBuffer();
    const headers = new Headers();
    const contentType = res.headers.get('content-type');
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'private, max-age=60');
    return new Response(buffer, { status: 200, headers });
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}

// POST /api/profiles/avatar — forward the cropped image to the API.
export async function POST(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof Blob)) {
      return Response.json({ error: 'Attach an image file' }, { status: 400 });
    }
    const out = new FormData();
    out.append('file', file, 'avatar.webp');
    const res = await fetch(`${serverApiUrl()}/v1/profiles/me/avatar`, {
      method: 'POST',
      headers: cookieHeader(request),
      body: out,
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}

// DELETE /api/profiles/avatar — remove the uploaded photo.
export async function DELETE(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const res = await fetch(`${serverApiUrl()}/v1/profiles/me/avatar`, {
      method: 'DELETE',
      headers: cookieHeader(request),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({}));
    return Response.json(data, { status: res.status });
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}
