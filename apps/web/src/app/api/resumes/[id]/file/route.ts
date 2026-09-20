import { requireUserId } from '@/lib/require-user';
import { serverApiUrl } from '@/lib/server-api-url';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;
  const cookie = request.headers.get('cookie');
  const { id } = await params;
  const incoming = new URL(request.url);
  const download = incoming.searchParams.get('download');

  try {
    const target = new URL(
      `${serverApiUrl()}/v1/resumes/${encodeURIComponent(id)}/file`,
    );
    if (download) target.searchParams.set('download', download);
    // Stream — no arrayBuffer(), no short timeout (large PDFs on slow links).
    const res = await fetch(target, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      return Response.json(data, { status: res.status });
    }
    const headers = new Headers();
    const contentType = res.headers.get('content-type');
    const disposition = res.headers.get('content-disposition');
    const length = res.headers.get('content-length');
    if (contentType) headers.set('Content-Type', contentType);
    if (disposition) headers.set('Content-Disposition', disposition);
    if (length) headers.set('Content-Length', length);
    headers.set('Cache-Control', 'private, max-age=300');
    return new Response(res.body, { status: 200, headers });
  } catch {
    return Response.json({ error: 'API is unavailable' }, { status: 502 });
  }
}
