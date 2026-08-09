import type { MatchEventType } from '@/app/api/resume/match-interactions/route';

interface TrackMatchInteractionInput {
  sessionId: string;
  userId: string;
  resumeId: string;
  dedupKey: string;
  jobTitle: string;
  companyName: string;
  eventType: MatchEventType;
  rankPosition?: number;
  matchScore?: number;
}

/** Fire-and-forget match feedback — never blocks UI. */
export function trackMatchInteraction(input: TrackMatchInteractionInput): void {
  void fetch('/api/resume/match-interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: input.sessionId,
      user_id: input.userId,
      resume_id: input.resumeId,
      dedup_key: input.dedupKey,
      job_title: input.jobTitle,
      company_name: input.companyName,
      event_type: input.eventType,
      rank_position: input.rankPosition,
      match_score: input.matchScore,
    }),
  }).catch(() => {
    // Analytics must not break the product flow.
  });
}
