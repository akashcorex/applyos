export type AdminRole = 'USER' | 'ADMIN';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';
export type ResumeStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ARCHIVED';

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  image: string | null;
  role: AdminRole;
  status: AccountStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminResume {
  id: string;
  userId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  status: ResumeStatus;
  createdAt: string;
  updatedAt: string;
  errorCode?: string | null;
  errorMessage?: string | null;
  extractions?: Array<{
    revisionNumber: number;
    status: string;
    schemaVersion: string;
    createdAt: string;
  }>;
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(json.error ?? `Request failed (${res.status})`);
  }
  return json;
}

export function fetchMe() {
  return adminFetch<{ user: AdminUser }>('/api/me');
}

export function fetchAdminUsers(args?: {
  limit?: number;
  offset?: number;
  role?: AdminRole | '';
  status?: AccountStatus | '';
}) {
  const q = new URLSearchParams();
  q.set('limit', String(args?.limit ?? 50));
  q.set('offset', String(args?.offset ?? 0));
  if (args?.role) q.set('role', args.role);
  if (args?.status) q.set('status', args.status);
  return adminFetch<{ total: number; users: AdminUser[] }>(
    `/api/admin/users?${q}`,
  );
}

export function fetchAdminUser(id: string) {
  return adminFetch<{
    user: AdminUser;
    profile: Record<string, unknown> | null;
    resumes: AdminResume[];
  }>(`/api/admin/users/${encodeURIComponent(id)}`);
}

export function fetchAdminResumes(args?: {
  limit?: number;
  offset?: number;
  status?: ResumeStatus | '';
}) {
  const q = new URLSearchParams();
  q.set('limit', String(args?.limit ?? 50));
  q.set('offset', String(args?.offset ?? 0));
  if (args?.status) q.set('status', args.status);
  return adminFetch<{ total: number; resumes: AdminResume[] }>(
    `/api/admin/resumes?${q}`,
  );
}

export function fetchAdminResume(id: string) {
  return adminFetch<{
    resume: AdminResume & { user: AdminUser };
    extractions: unknown[];
    profile: Record<string, unknown> | null;
  }>(`/api/admin/resumes/${encodeURIComponent(id)}`);
}

export function patchAdminUser(
  id: string,
  data: { role?: AdminRole; status?: AccountStatus },
) {
  return adminFetch<{ user: AdminUser }>(
    `/api/admin/users/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify(data) },
  );
}
