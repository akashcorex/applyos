export interface ChunkPlan {
  companies: number;
  jobsPerCompany: number;
}

export const MATCH_CHUNKS: ChunkPlan[] = [
  { companies: 3, jobsPerCompany: 30 },
  { companies: 3, jobsPerCompany: 30 },
  { companies: 3, jobsPerCompany: 30 },
  { companies: 3, jobsPerCompany: 30 },
];

export function normalizeScore(score: number): number {
  return score <= 1 ? score * 100 : score;
}

export interface SseFrame {
  event: string;
  data: unknown;
}

export function parseSseBuffer(text: string): {
  frames: SseFrame[];
  leftover: string;
} {
  const frames: SseFrame[] = [];
  const parts = text.split('\n\n');
  const leftover = parts.pop() ?? '';
  for (const part of parts) {
    let event: string | null = null;
    let payload: unknown = null;
    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        try {
          payload = JSON.parse(line.slice('data:'.length));
        } catch {
          payload = null;
        }
      }
    }
    if (event && payload && typeof payload === 'object') {
      frames.push({ event, data: payload });
    }
  }
  return { frames, leftover };
}

export interface MergeableJob {
  dedup_key: string;
  match_score: number;
}

export function mergeJobChunks<T extends MergeableJob>(
  existing: T[],
  incoming: T[],
): { jobs: T[]; freshKeys: string[] } {
  const merged = new Map<string, T>();
  for (const job of existing) {
    if (job.dedup_key) merged.set(job.dedup_key, job);
  }
  const freshKeys: string[] = [];
  for (const job of incoming) {
    if (!job.dedup_key) continue;
    const previous = merged.get(job.dedup_key);
    if (!previous) freshKeys.push(job.dedup_key);
    if (
      !previous ||
      normalizeScore(job.match_score) > normalizeScore(previous.match_score)
    ) {
      merged.set(job.dedup_key, job);
    }
  }
  const jobs = [...merged.values()].sort(
    (a, b) => normalizeScore(b.match_score) - normalizeScore(a.match_score),
  );
  return { jobs, freshKeys };
}
