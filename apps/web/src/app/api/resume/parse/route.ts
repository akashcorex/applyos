import { requireUserId } from '@/lib/require-user';

const API_URL = process.env.API_URL ?? 'http://localhost:5000';
const POLL_MS = 1500;
const TIMEOUT_MS = 120000;

function cookieHeader(request: Request): HeadersInit {
  const cookie = request.headers.get('cookie');
  return cookie ? { cookie } : {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asSkillNames(skills: unknown): string[] {
  if (!Array.isArray(skills)) return [];
  const names: string[] = [];
  for (const item of skills) {
    if (typeof item === 'string' && item.trim()) names.push(item.trim());
    else if (item && typeof item === 'object' && 'name' in item) {
      const name = (item as { name?: unknown }).name;
      if (typeof name === 'string' && name.trim()) names.push(name.trim());
    }
  }
  return names;
}

export async function POST(request: Request) {
  try {
    const userOrErr = await requireUserId(request);
    if (userOrErr instanceof Response) return userOrErr;

    const formData = await request.formData();
    const file = formData.get('file');
    const userId = formData.get('user_id');

    if (!(file instanceof File)) {
      return Response.json({ error: 'file is required' }, { status: 400 });
    }
    if (typeof userId !== 'string' || !userId.trim()) {
      return Response.json({ error: 'user_id is required' }, { status: 400 });
    }
    if (userId !== userOrErr) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const upstream = new FormData();
    upstream.append('file', file, file.name);

    const uploadRes = await fetch(`${API_URL}/v1/resumes/upload`, {
      method: 'POST',
      headers: cookieHeader(request),
      body: upstream,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const uploadData = (await uploadRes.json().catch(() => null)) as {
      resume?: { id?: string };
      error?: string;
    } | null;
    if (!uploadRes.ok || !uploadData?.resume?.id) {
      return Response.json(
        { error: uploadData?.error ?? 'Failed to upload resume' },
        { status: uploadRes.status || 502 },
      );
    }

    const resumeFileId = uploadData.resume.id;
    const deadline = Date.now() + TIMEOUT_MS;
    let status = 'PROCESSING';
    let errorMessage: string | null = null;

    while (Date.now() < deadline) {
      const statusRes = await fetch(
        `${API_URL}/v1/resumes/${encodeURIComponent(resumeFileId)}/status`,
        {
          headers: cookieHeader(request),
          cache: 'no-store',
          signal: AbortSignal.timeout(10000),
        },
      );
      const statusData = (await statusRes.json().catch(() => null)) as {
        status?: { status?: string; errorMessage?: string | null };
      } | null;
      status = statusData?.status?.status ?? status;
      if (status === 'COMPLETED') break;
      if (status === 'FAILED') {
        errorMessage =
          statusData?.status?.errorMessage ?? 'Resume processing failed';
        break;
      }
      await sleep(POLL_MS);
    }

    if (status === 'FAILED') {
      return Response.json({ error: errorMessage }, { status: 422 });
    }
    if (status !== 'COMPLETED') {
      return Response.json(
        { error: 'Resume processing timed out. Please retry.' },
        { status: 504 },
      );
    }

    const [resumeRes, extractionRes] = await Promise.all([
      fetch(`${API_URL}/v1/resumes/${encodeURIComponent(resumeFileId)}`, {
        headers: cookieHeader(request),
        cache: 'no-store',
      }),
      fetch(
        `${API_URL}/v1/resumes/${encodeURIComponent(resumeFileId)}/extraction`,
        {
          headers: cookieHeader(request),
          cache: 'no-store',
        },
      ),
    ]);
    const resumeJson = (await resumeRes.json().catch(() => null)) as {
      resume?: { resumeId?: string | null };
    } | null;
    const extractionJson = (await extractionRes.json().catch(() => null)) as {
      extraction?: { payload?: Record<string, unknown> };
    } | null;

    const payload = extractionJson?.extraction?.payload ?? {};
    const legacyId = resumeJson?.resume?.resumeId;
    if (!legacyId) {
      return Response.json(
        { error: 'Extraction finished but no legacy resume id was linked' },
        { status: 502 },
      );
    }

    const skills = asSkillNames(payload.skills);
    return Response.json({
      resume_id: legacyId,
      resume_file_id: resumeFileId,
      user_id: userOrErr,
      full_name: payload.fullName ?? '',
      email: payload.email ?? '',
      phone: payload.phone ?? null,
      location: payload.location ?? null,
      summary: payload.professionalSummary ?? null,
      experience_years: 0,
      skills,
      education: payload.education ?? [],
      work_history: payload.experience ?? [],
      preferred_role: payload.headline ?? null,
      preferred_locations: [],
      file_name: file.name,
    });
  } catch {
    return Response.json(
      { error: 'Resume service is unreachable' },
      { status: 502 },
    );
  }
}
