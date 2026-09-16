export interface ParsedResumePayload {
  resume_id: string;
  resume_file_id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone?: string | null;
  location?: string | null;
  summary?: string | null;
  experience_years: number;
  total_experience_years?: number | null;
  skills: string[];
  education: unknown[];
  work_history: unknown[];
  preferred_role?: string | null;
  preferred_locations?: string[];
  seniority?: string | null;
  work_mode?: string | null;
  file_name?: string | null;
}

export function asSkillNames(skills: unknown): string[] {
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

export function buildParsedResumePayload(input: {
  legacyResumeId: string;
  resumeFileId: string;
  userId: string;
  extractionPayload: Record<string, unknown>;
  experienceYears?: number | null;
  preferredRole?: string | null;
  preferredLocations?: string[] | null;
  fileName?: string | null;
}): ParsedResumePayload {
  const payload = input.extractionPayload;
  return {
    resume_id: input.legacyResumeId,
    resume_file_id: input.resumeFileId,
    user_id: input.userId,
    full_name: String(payload.fullName ?? ''),
    email: String(payload.email ?? ''),
    phone: (payload.phone as string | null | undefined) ?? null,
    location: (payload.location as string | null | undefined) ?? null,
    summary: (payload.professionalSummary as string | null | undefined) ?? null,
    experience_years: input.experienceYears ?? 0,
    total_experience_years: input.experienceYears ?? null,
    skills: asSkillNames(payload.skills),
    education: Array.isArray(payload.education) ? payload.education : [],
    work_history: Array.isArray(payload.experience) ? payload.experience : [],
    preferred_role:
      input.preferredRole ??
      (payload.headline as string | null | undefined) ??
      null,
    preferred_locations: input.preferredLocations ?? [],
    seniority: null,
    work_mode: null,
    file_name: input.fileName ?? null,
  };
}
