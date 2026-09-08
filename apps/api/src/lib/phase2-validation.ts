/**
 * Phase 2 — Resume Intelligence & Profile Enrichment validation.
 *
 * Pure helpers (no DB, no network) so they are unit-testable with bun:test.
 * Mirrors the resume-agent contract:
 *   RawLLMExtraction (loose, nullable) -> ResumeRecord -> ResumeIR (v1)
 * and adds the Phase 2 structured extraction contract (v2) covering
 * education / experience / skills / projects / certifications /
 * achievements / links.
 *
 * Rules:
 * - Never fabricate: missing info stays null/[] — never guessed.
 * - Never blindly persist AI output: validate before Prisma writes.
 * - Never expose internals: sanitizeErrorForUser() maps agent errors to
 *   safe { code, message } pairs.
 */

export const EXTRACTION_SCHEMA_VERSION = 'resume-extraction.v2';
export const PARSER_VERSION_DEFAULT = 'resume-parser.v1';

export type ResumeLifecycleStatus =
  'UPLOADED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';

const LIFECYCLE: ResumeLifecycleStatus[] = [
  'UPLOADED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'ARCHIVED',
];

export function isLifecycleStatus(
  value: unknown,
): value is ResumeLifecycleStatus {
  return typeof value === 'string' && (LIFECYCLE as string[]).includes(value);
}

/**
 * Full lifecycle graph (including agent-only edges).
 * User-facing PATCH must use `canUserTransitionStatus` instead —
 * COMPLETED / FAILED / PROCESSING are never client-writable.
 * ARCHIVED is terminal except same-status no-ops.
 */
export function canTransitionStatus(
  from: ResumeLifecycleStatus,
  to: ResumeLifecycleStatus,
): boolean {
  if (from === to) return true;
  if (to === 'ARCHIVED') return from !== 'ARCHIVED';
  switch (from) {
    case 'UPLOADED':
      return to === 'PROCESSING';
    case 'PROCESSING':
      return to === 'COMPLETED' || to === 'FAILED';
    case 'FAILED':
      return to === 'PROCESSING';
    case 'COMPLETED':
      return to === 'PROCESSING';
    case 'ARCHIVED':
      return false;
    default:
      return false;
  }
}

/** Session users may only archive (or no-op the current status). */
export function canUserTransitionStatus(
  from: ResumeLifecycleStatus,
  to: ResumeLifecycleStatus,
): boolean {
  if (from === to) return true;
  return to === 'ARCHIVED' && from !== 'ARCHIVED';
}

/**
 * Agent callbacks: COMPLETED/FAILED from UPLOADED (no prior /process)
 * or PROCESSING. ARCHIVED is rejected.
 */
export function canAgentTransitionStatus(
  from: ResumeLifecycleStatus,
  to: ResumeLifecycleStatus,
): boolean {
  if (from === 'ARCHIVED') return false;
  if (from === to) return true;
  if (to === 'COMPLETED' || to === 'FAILED') {
    return from === 'UPLOADED' || from === 'PROCESSING';
  }
  return false;
}

export function nextRevisionNumber(existingCount: number): number {
  const n = Math.floor(existingCount);
  return (Number.isFinite(n) ? Math.max(n, 0) : 0) + 1;
}

// ---------------------------------------------------------------------------
// Structured extraction contract (STEP 5)
// ---------------------------------------------------------------------------

export interface ExtractionEducation {
  institution: string;
  degree: string;
  fieldOfStudy: string | null;
  startDate: string | null;
  endDate: string | null;
  graduationDate: string | null;
}

export interface ExtractionExperience {
  company: string;
  title: string;
  location: string | null;
  employmentType: string | null;
  startDate: string | null;
  endDate: string | null;
  description: string | null;
  achievements: string[];
}

export interface ExtractionSkill {
  name: string;
  category: string | null;
}

export interface ExtractionProject {
  name: string;
  description: string | null;
  technologies: string[];
  url: string | null;
}

export interface ExtractionCertification {
  name: string;
  issuer: string | null;
  date: string | null;
  credentialId: string | null;
  url: string | null;
}

export interface ExtractionAchievement {
  title: string;
  description: string | null;
  date: string | null;
}

export interface ExtractionLinks {
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
  others: string[];
}

export interface StructuredExtraction {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  professionalSummary: string | null;
  headline: string | null;
  education: ExtractionEducation[];
  experience: ExtractionExperience[];
  skills: ExtractionSkill[];
  projects: ExtractionProject[];
  certifications: ExtractionCertification[];
  achievements: ExtractionAchievement[];
  links: ExtractionLinks;
}

const MAX = {
  name: 200,
  email: 320,
  phone: 32,
  location: 200,
  text2000: 2000,
  url: 2048,
  skills: 200,
  education: 50,
  experience: 50,
  projects: 50,
  certifications: 50,
  achievements: 100,
  tags: 100,
} as const;

function asTrimmed(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  return t.length > maxLen ? null : t;
}

function asRequiredTrimmed(value: unknown, maxLen: number): string | null {
  const t = asTrimmed(value, maxLen);
  return t && t.length > 0 ? t : null;
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function asUrl(value: unknown): string | null {
  const t = asTrimmed(value, MAX.url);
  if (!t) return null;
  return isHttpUrl(t) ? t : null;
}

function asEmail(value: unknown): string | null {
  const t = asTrimmed(value, MAX.email)?.toLowerCase();
  if (!t) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
}

function asPhone(value: unknown): string | null {
  const t = asTrimmed(value, MAX.phone);
  if (!t) return null;
  return /^[+()\-. \d]+$/.test(t) ? t : null;
}

/** YYYY or YYYY-MM. Null when absent; invalid formats are rejected. */
function asDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (!t) return null;
  if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(t)) return t;
  if (/^(19|20)\d{2}$/.test(t)) return t;
  return null;
}

function asStringList(
  value: unknown,
  maxItems: number,
  maxLen: number,
): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > maxItems) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string') return null;
    const t = item.trim();
    if (!t) continue;
    if (t.length > maxLen) return null;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * Validate raw AI/agent output against the Phase 2 extraction contract.
 * Unknown keys are stripped; missing stays missing (never fabricated).
 */
export function validateExtractionPayload(
  raw: unknown,
): { ok: true; data: StructuredExtraction } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('Extraction payload must be an object');
  }
  const o = raw as Record<string, unknown>;

  const fullName = asRequiredTrimmed(o.fullName ?? o.full_name, MAX.name);
  if (!fullName) return fail('Invalid fullName');
  const email = asEmail(o.email);
  if (!email) return fail('Invalid email');

  const phone = o.phone == null ? null : asPhone(o.phone);
  if (o.phone != null && phone === null && String(o.phone).trim() !== '') {
    return fail('Invalid phone');
  }
  const location = asTrimmed(o.location, MAX.location);
  const professionalSummary = asTrimmed(
    o.professionalSummary ?? o.summary,
    MAX.text2000,
  );
  const headline = asTrimmed(o.headline ?? o.preferred_role, MAX.name);

  // --- education ---
  const eduRaw = o.education === undefined ? [] : o.education;
  if (!Array.isArray(eduRaw)) return fail('Invalid education');
  if (eduRaw.length > MAX.education) return fail('Too many education entries');
  const education: ExtractionEducation[] = [];
  for (const e of eduRaw) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      return fail('Invalid education entry');
    }
    const eObj = e as Record<string, unknown>;
    const institution = asRequiredTrimmed(
      eObj.institution ?? eObj.school,
      MAX.name,
    );
    const degree = asRequiredTrimmed(eObj.degree, MAX.name);
    if (!institution || !degree) return fail('Invalid education entry');
    const startDate =
      eObj.startDate === undefined ? null : asDate(eObj.startDate);
    if (
      eObj.startDate != null &&
      startDate === null &&
      String(eObj.startDate).trim() !== ''
    ) {
      return fail('Invalid education startDate');
    }
    const endDate = eObj.endDate === undefined ? null : asDate(eObj.endDate);
    if (
      eObj.endDate != null &&
      endDate === null &&
      String(eObj.endDate).trim() !== ''
    ) {
      return fail('Invalid education endDate');
    }
    const graduationDate =
      eObj.graduationDate === undefined
        ? eObj.year === undefined
          ? null
          : asDate(String(eObj.year))
        : asDate(eObj.graduationDate);
    education.push({
      institution,
      degree,
      fieldOfStudy: asTrimmed(
        eObj.fieldOfStudy ?? eObj.field_of_study,
        MAX.name,
      ),
      startDate,
      endDate,
      graduationDate,
    });
  }

  // --- experience ---
  const expRaw = o.experience ?? o.work_history ?? o.workHistory ?? [];
  if (!Array.isArray(expRaw)) return fail('Invalid experience');
  if (expRaw.length > MAX.experience) {
    return fail('Too many experience entries');
  }
  const experience: ExtractionExperience[] = [];
  for (const w of expRaw) {
    if (!w || typeof w !== 'object' || Array.isArray(w)) {
      return fail('Invalid experience entry');
    }
    const wObj = w as Record<string, unknown>;
    const company = asRequiredTrimmed(wObj.company, MAX.name);
    const title = asRequiredTrimmed(wObj.title, MAX.name);
    if (!company || !title) return fail('Invalid experience entry');
    const achievementsRaw =
      wObj.achievements ?? wObj.highlights ?? wObj.bullets ?? [];
    const achievements = asStringList(achievementsRaw, MAX.tags, MAX.text2000);
    if (achievements === null) return fail('Invalid experience achievements');
    const startDate =
      wObj.startDate === undefined && wObj.start_date === undefined
        ? null
        : asDate(wObj.startDate ?? wObj.start_date);
    const endDate =
      wObj.endDate === undefined && wObj.end_date === undefined
        ? null
        : asDate(wObj.endDate ?? wObj.end_date);
    experience.push({
      company,
      title,
      location: asTrimmed(wObj.location, MAX.location),
      employmentType: asTrimmed(
        wObj.employmentType ?? wObj.employment_type,
        64,
      ),
      startDate,
      endDate,
      description: asTrimmed(wObj.description ?? wObj.summary, MAX.text2000),
      achievements,
    });
  }

  // --- skills: accept [{name,category}] or ["name"] ---
  const skillsRaw = o.skills === undefined ? [] : o.skills;
  if (!Array.isArray(skillsRaw)) return fail('Invalid skills');
  if (skillsRaw.length > MAX.skills) return fail('Too many skills');
  const skills: ExtractionSkill[] = [];
  const seenSkills = new Set<string>();
  for (const s of skillsRaw) {
    if (typeof s === 'string') {
      const name = asTrimmed(s, 120);
      if (!name) return fail('Invalid skill name');
      const k = name.toLowerCase();
      if (seenSkills.has(k)) continue;
      seenSkills.add(k);
      skills.push({ name, category: null });
      continue;
    }
    if (!s || typeof s !== 'object' || Array.isArray(s)) {
      return fail('Invalid skill entry');
    }
    const sObj = s as Record<string, unknown>;
    const name = asRequiredTrimmed(sObj.name, 120);
    if (!name) return fail('Invalid skill name');
    const k = name.toLowerCase();
    if (seenSkills.has(k)) continue;
    seenSkills.add(k);
    skills.push({
      name,
      category: asTrimmed(sObj.category, 64),
    });
  }

  // --- projects ---
  const projRaw = o.projects === undefined ? [] : o.projects;
  if (!Array.isArray(projRaw)) return fail('Invalid projects');
  if (projRaw.length > MAX.projects) return fail('Too many projects');
  const projects: ExtractionProject[] = [];
  for (const p of projRaw) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) {
      return fail('Invalid project entry');
    }
    const pObj = p as Record<string, unknown>;
    const name = asRequiredTrimmed(pObj.name, MAX.name);
    if (!name) return fail('Invalid project name');
    const technologies = asStringList(
      pObj.technologies ?? pObj.tech ?? [],
      MAX.tags,
      64,
    );
    if (technologies === null) return fail('Invalid project technologies');
    const url =
      pObj.url === undefined || pObj.url === null || pObj.url === ''
        ? null
        : asUrl(pObj.url);
    if (pObj.url != null && String(pObj.url).trim() !== '' && url === null) {
      return fail('Invalid project url');
    }
    projects.push({
      name,
      description: asTrimmed(pObj.description, MAX.text2000),
      technologies,
      url,
    });
  }

  // --- certifications ---
  const certRaw = o.certifications === undefined ? [] : o.certifications;
  if (!Array.isArray(certRaw)) return fail('Invalid certifications');
  if (certRaw.length > MAX.certifications) {
    return fail('Too many certifications');
  }
  const certifications: ExtractionCertification[] = [];
  for (const c of certRaw) {
    if (!c || typeof c !== 'object' || Array.isArray(c)) {
      return fail('Invalid certification entry');
    }
    const cObj = c as Record<string, unknown>;
    const name = asRequiredTrimmed(cObj.name, MAX.name);
    if (!name) return fail('Invalid certification name');
    certifications.push({
      name,
      issuer: asTrimmed(cObj.issuer, MAX.name),
      date: cObj.date === undefined ? null : asDate(cObj.date),
      credentialId: asTrimmed(
        cObj.credentialId ?? cObj.credential_id,
        MAX.name,
      ),
      url:
        cObj.url === undefined || cObj.url === null || cObj.url === ''
          ? null
          : asUrl(cObj.url),
    });
  }

  // --- achievements ---
  const achRaw = o.achievements === undefined ? [] : o.achievements;
  if (!Array.isArray(achRaw)) return fail('Invalid achievements');
  if (achRaw.length > MAX.achievements) {
    return fail('Too many achievements');
  }
  const achievements: ExtractionAchievement[] = [];
  for (const a of achRaw) {
    if (typeof a === 'string') {
      const title = asTrimmed(a, 300);
      if (!title) return fail('Invalid achievement title');
      achievements.push({ title, description: null, date: null });
      continue;
    }
    if (!a || typeof a !== 'object' || Array.isArray(a)) {
      return fail('Invalid achievement entry');
    }
    const aObj = a as Record<string, unknown>;
    const title = asRequiredTrimmed(aObj.title, 300);
    if (!title) return fail('Invalid achievement title');
    achievements.push({
      title,
      description: asTrimmed(aObj.description, MAX.text2000),
      date: aObj.date === undefined ? null : asDate(aObj.date),
    });
  }

  // --- links ---
  const linksRaw =
    o.links && typeof o.links === 'object' && !Array.isArray(o.links)
      ? (o.links as Record<string, unknown>)
      : {};
  const linkLinkedin = linksRaw.linkedin ?? o.linkedinUrl ?? o.linkedin ?? null;
  const linkGithub = linksRaw.github ?? o.githubUrl ?? o.github ?? null;
  const linkPortfolio =
    linksRaw.portfolio ?? o.portfolioUrl ?? o.portfolio ?? null;
  const othersRaw = Array.isArray(linksRaw.others)
    ? linksRaw.others
    : Array.isArray(o.otherUrls)
      ? o.otherUrls
      : [];
  const others = asStringList(othersRaw, 20, MAX.url);
  if (others === null) return fail('Invalid links.others');
  for (const u of others) {
    if (!isHttpUrl(u)) return fail('Invalid links.others url');
  }
  const links: ExtractionLinks = {
    linkedin:
      linkLinkedin == null || String(linkLinkedin).trim() === ''
        ? null
        : asUrl(linkLinkedin),
    github:
      linkGithub == null || String(linkGithub).trim() === ''
        ? null
        : asUrl(linkGithub),
    portfolio:
      linkPortfolio == null || String(linkPortfolio).trim() === ''
        ? null
        : asUrl(linkPortfolio),
    others,
  };
  if (
    (linkLinkedin != null &&
      String(linkLinkedin).trim() !== '' &&
      links.linkedin === null) ||
    (linkGithub != null &&
      String(linkGithub).trim() !== '' &&
      links.github === null) ||
    (linkPortfolio != null &&
      String(linkPortfolio).trim() !== '' &&
      links.portfolio === null)
  ) {
    return fail('Invalid professional link url');
  }

  return {
    ok: true,
    data: {
      fullName,
      email,
      phone,
      location,
      professionalSummary,
      headline,
      education,
      experience,
      skills,
      projects,
      certifications,
      achievements,
      links,
    },
  };
}

// ---------------------------------------------------------------------------
// Enriched profile input (extends Phase 1 profile fields)
// ---------------------------------------------------------------------------

export interface EnrichedProfileData {
  fullName?: string | null;
  headline?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  professionalSummary?: string | null;
  linkedinUrl?: string | null;
  githubUrl?: string | null;
  portfolioUrl?: string | null;
  skills?: string[];
  education?: unknown[];
  experience?: unknown[];
  projects?: unknown[];
  certifications?: unknown[];
  achievements?: unknown[];
}

function optionalShortText(
  value: unknown,
  maxLen: number,
  field: string,
): { ok: true; value?: string | null } | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string')
    return { ok: false, error: `Invalid ${field}` };
  const t = value.trim();
  if (t === '') return { ok: true, value: null };
  if (t.length > maxLen) return { ok: false, error: `Invalid ${field}` };
  return { ok: true, value: t };
}

export function validateEnrichedProfileInput(
  body: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};

  for (const [field, maxLen] of [
    ['fullName', 120],
    ['headline', 200],
    ['location', 120],
    ['professionalSummary', 2000],
  ] as const) {
    if (body[field] === undefined) continue;
    const r = optionalShortText(body[field], maxLen, field);
    if (!r.ok) return r;
    if ('value' in r) data[field] = r.value;
  }

  if (body.email !== undefined) {
    if (body.email === null || String(body.email).trim() === '') {
      data.email = null;
    } else {
      const e = asEmail(body.email);
      if (!e) return fail('Invalid email');
      data.email = e;
    }
  }

  if (body.phone !== undefined) {
    if (body.phone === null || String(body.phone).trim() === '') {
      data.phone = null;
    } else {
      const p = asPhone(body.phone);
      if (!p) return fail('Invalid phone');
      if (p.length > 32) return fail('Invalid phone');
      data.phone = p;
    }
  }

  for (const field of ['linkedinUrl', 'githubUrl', 'portfolioUrl'] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null || String(body[field]).trim() === '') {
      data[field] = null;
      continue;
    }
    const u = asUrl(body[field]);
    if (!u) return fail(`Invalid ${field}`);
    data[field] = u;
  }

  if (body.skills !== undefined) {
    const parsed = validateExtractionPayload({
      fullName: 'Placeholder Name',
      email: 'placeholder@example.com',
      skills: body.skills,
    });
    if (!parsed.ok) return parsed;
    data.skills = parsed.data.skills.map((s) => s.name);
  }

  for (const field of [
    'education',
    'experience',
    'projects',
    'certifications',
    'achievements',
  ] as const) {
    if (body[field] === undefined) continue;
    const parsed = validateExtractionPayload({
      fullName: 'Placeholder Name',
      email: 'placeholder@example.com',
      [field]: body[field],
    });
    if (!parsed.ok) return parsed;
    data[field] = parsed.data[field];
  }

  return { ok: true, data };
}

/** Map an internal agent/parse error to a safe user-facing pair. */
export function sanitizeErrorForUser(input: {
  code?: unknown;
  message?: unknown;
}): { code: string; message: string } {
  const rawCode =
    typeof input.code === 'string' && input.code.trim()
      ? input.code
          .trim()
          .slice(0, 64)
          .toUpperCase()
          .replace(/[^A-Z0-9_]/g, '_')
      : 'PROCESSING_FAILED';
  const known: Record<string, string> = {
    EMPTY_FILE: 'The uploaded file is empty.',
    UNSUPPORTED_TYPE: 'Only PDF and DOCX resumes are supported.',
    NO_TEXT: 'No readable text was found in the file.',
    PARSE_FAILED: 'The resume could not be parsed. Try another file.',
    EXTRACTION_FAILED:
      'Automatic extraction failed. You can retry or fill in your profile manually.',
    TIMEOUT: 'Processing timed out. Please retry.',
  };
  const message =
    known[rawCode] ??
    'Resume processing failed. Please retry or fill in your profile manually.';
  return { code: rawCode || 'PROCESSING_FAILED', message };
}

/**
 * Fold a validated extraction into Profile create/update data.
 * Used by the agent callback — never writes secrets, only candidate fields.
 */
export function extractionToProfileData(
  extraction: StructuredExtraction,
  extractionVersion: string,
  resumeFileId: string,
): Record<string, unknown> {
  return {
    fullName: extraction.fullName,
    headline: extraction.headline,
    email: extraction.email,
    phone: extraction.phone,
    location: extraction.location,
    professionalSummary: extraction.professionalSummary,
    linkedinUrl: extraction.links.linkedin,
    githubUrl: extraction.links.github,
    portfolioUrl: extraction.links.portfolio,
    skills: extraction.skills.map((s) => s.name),
    education: extraction.education,
    experience: extraction.experience,
    projects: extraction.projects,
    certifications: extraction.certifications,
    achievements: extraction.achievements,
    isConfirmed: false,
    lastExtractedAt: new Date(),
    extractionVersion,
    sourceResumeFileId: resumeFileId,
  };
}
