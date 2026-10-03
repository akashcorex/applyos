import { prisma } from '@applyso/database';

const JOB_AGENT_URL = process.env.JOB_AGENT_URL ?? 'http://127.0.0.1:8002';

/** Boards with older cache are skipped (unknown, not closed). */
const BOARD_CACHE_MAX_AGE_HOURS = 6;
/** Backstop: unseen anywhere for this long closes even unchecked boards. */
const UNSEEN_BACKSTOP_DAYS = 7;
/** Listings older than this are retired even if still seen. */
const MAX_AGE_DAYS = 120;

const FETCH_TIMEOUT_MS = 15000;
const KEY_CHUNK_SIZE = 500;

export interface ReconcileResult {
  boards: number;
  skippedBoards: number;
  seen: number;
  closed: number;
}

interface RegistryBoard {
  domain?: unknown;
  active?: unknown;
}

interface BoardKeys {
  scraped_at?: unknown;
  keys?: unknown;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`job-agent ${response.status} for ${url}`);
  return response.json() as Promise<unknown>;
}

function scrapedAtDate(value: unknown, maxAgeHours: number): Date | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  if (Date.now() - time > maxAgeHours * 3600 * 1000) return null;
  return new Date(time);
}

/** Mark listings that left every board (or aged out) as closed. */
export async function reconcileJobs(): Promise<ReconcileResult> {
  const now = new Date();
  const registry = (await fetchJson(`${JOB_AGENT_URL}/registry`)) as {
    boards?: RegistryBoard[];
  };
  const boards = Array.isArray(registry.boards)
    ? registry.boards.filter(
        (board) =>
          typeof board.domain === 'string' &&
          board.domain.trim() &&
          board.active !== false,
      )
    : [];
  let skippedBoards = 0;
  let seen = 0;
  let closed = 0;
  for (const board of boards) {
    const domain = (board.domain as string).trim().toLowerCase();
    try {
      const data = (await fetchJson(
        `${JOB_AGENT_URL}/registry/board-keys?domain=${encodeURIComponent(domain)}`,
      )) as BoardKeys;
      const scrapedAt = scrapedAtDate(
        data.scraped_at,
        BOARD_CACHE_MAX_AGE_HOURS,
      );
      if (!scrapedAt) {
        skippedBoards += 1;
        continue;
      }
      const keys = Array.isArray(data.keys)
        ? data.keys.filter(
            (key): key is string => typeof key === 'string' && key.length > 0,
          )
        : [];
      for (const group of chunk(keys, KEY_CHUNK_SIZE)) {
        const updated = await prisma.job.updateMany({
          where: { dedupKey: { in: group }, isActive: true },
          data: { lastSeenAt: now },
        });
        seen += updated.count;
      }
      const gone = await prisma.job.updateMany({
        where: {
          isActive: true,
          dedupKey: { startsWith: `${domain}::` },
          lastSeenAt: { lt: scrapedAt },
        },
        data: { isActive: false, closedAt: now },
      });
      closed += gone.count;
    } catch (error) {
      skippedBoards += 1;
      console.error(`[jobs] reconcile skipped ${domain}:`, error);
    }
  }
  const backstopCutoff = new Date(
    now.getTime() - UNSEEN_BACKSTOP_DAYS * 24 * 3600 * 1000,
  );
  const agedCutoff = new Date(now.getTime() - MAX_AGE_DAYS * 24 * 3600 * 1000);
  const retired = await prisma.job.updateMany({
    where: {
      isActive: true,
      OR: [
        { lastSeenAt: { lt: backstopCutoff } },
        { firstSeenAt: { lt: agedCutoff } },
      ],
    },
    data: { isActive: false, closedAt: now },
  });
  closed += retired.count;
  return { boards: boards.length, skippedBoards, seen, closed };
}
