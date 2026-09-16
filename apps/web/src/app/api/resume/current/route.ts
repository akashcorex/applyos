import { buildParsedResumePayload } from '@/lib/parsed-resume';
import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';

function cookieHeader(request: Request): HeadersInit {
  const cookie = request.headers.get('cookie');
  return cookie ? { cookie } : {};
}

export async function GET(request: Request) {
  const userOrErr = await requireUserId(request);
  if (userOrErr instanceof Response) return userOrErr;

  try {
    const listRes = await fetch(`${API_URL}/v1/resumes?limit=20`, {
      headers: cookieHeader(request),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const listData = (await listRes.json().catch(() => null)) as {
      resumes?: {
        id?: string;
        status?: string;
        fileName?: string;
        resumeId?: string | null;
      }[];
      error?: string;
    } | null;
    if (!listRes.ok) {
      return Response.json(
        { error: listData?.error ?? 'Could not load resumes' },
        { status: listRes.status },
      );
    }

    const latest = (listData?.resumes ?? []).find(
      (row) => row.status === 'COMPLETED' && row.resumeId,
    );
    if (!latest?.id || !latest.resumeId) {
      return Response.json(
        { error: 'No processed resume found' },
        { status: 404 },
      );
    }

    const [resumeRes, extractionRes] = await Promise.all([
      fetch(`${API_URL}/v1/resumes/${encodeURIComponent(latest.id)}`, {
        headers: cookieHeader(request),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }),
      fetch(
        `${API_URL}/v1/resumes/${encodeURIComponent(latest.id)}/extraction`,
        {
          headers: cookieHeader(request),
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      ),
    ]);
    const resumeJson = (await resumeRes.json().catch(() => null)) as {
      resume?: {
        resumeId?: string | null;
        fileName?: string;
        resume?: {
          experienceYears?: number;
          preferredRole?: string | null;
          preferredLocations?: string[];
        } | null;
      };
      error?: string;
    } | null;
    const extractionJson = (await extractionRes.json().catch(() => null)) as {
      extraction?: { payload?: Record<string, unknown> };
      error?: string;
    } | null;

    if (!resumeRes.ok || !extractionRes.ok) {
      return Response.json(
        {
          error:
            resumeJson?.error ??
            extractionJson?.error ??
            'Could not load resume details',
        },
        { status: resumeRes.ok ? extractionRes.status : resumeRes.status },
      );
    }

    const legacyId = resumeJson?.resume?.resumeId ?? latest.resumeId;
    if (!legacyId) {
      return Response.json(
        { error: 'Processed resume is missing a legacy resume id' },
        { status: 502 },
      );
    }

    const payload = extractionJson?.extraction?.payload ?? {};
    return Response.json(
      buildParsedResumePayload({
        legacyResumeId: legacyId,
        resumeFileId: latest.id,
        userId: userOrErr,
        extractionPayload: payload,
        experienceYears: resumeJson?.resume?.resume?.experienceYears ?? 0,
        preferredRole: resumeJson?.resume?.resume?.preferredRole ?? null,
        preferredLocations:
          resumeJson?.resume?.resume?.preferredLocations ?? [],
        fileName: resumeJson?.resume?.fileName ?? latest.fileName ?? null,
      }),
    );
  } catch {
    return Response.json(
      { error: 'Resume service is unreachable' },
      { status: 502 },
    );
  }
}
