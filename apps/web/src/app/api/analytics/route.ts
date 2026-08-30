import { NextResponse } from 'next/server';
import { analyticsEvents, analyticsIdentities, db } from '@applyso/database';
import { AnalyticsPayload } from '@applyso/analytics';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const events: AnalyticsPayload[] = body?.events;

    if (!Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ success: true, count: 0 });
    }

    const records = events.map((e) => ({
      eventId: e.eventId || crypto.randomUUID(),
      eventName: e.event,
      feature: e.feature || null,
      userId: e.userId || null,
      anonymousId: e.anonymousId,
      sessionId: e.sessionId,
      page: e.page || null,
      component: e.component || null,
      source: e.source || 'client',
      properties: e.properties || {},
      context: e.context || {},
      environment: e.environment || 'development',
      timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
    }));

    // Batch insert into analytics_events
    await db.insert(analyticsEvents).values(records);

    // Identify stitching for any events with both userId and anonymousId
    const identityPairs = events
      .filter(
        (e) =>
          e.userId && e.anonymousId && e.anonymousId !== 'server_anonymous',
      )
      .map((e) => ({
        userId: e.userId as string,
        anonymousId: e.anonymousId,
      }));

    if (identityPairs.length > 0) {
      const uniqueIdentities = Array.from(
        new Map(
          identityPairs.map((p) => [`${p.userId}:${p.anonymousId}`, p]),
        ).values(),
      );

      for (const pair of uniqueIdentities) {
        try {
          await db
            .insert(analyticsIdentities)
            .values({
              userId: pair.userId,
              anonymousId: pair.anonymousId,
              firstSeenAt: new Date(),
              linkedAt: new Date(),
            })
            .onConflictDoNothing();
        } catch {
          // Ignore unique conflict or foreign key transient errors
        }
      }
    }

    return NextResponse.json({ success: true, count: records.length });
  } catch (error) {
    console.error('[Analytics Ingest Error]:', error);
    // Return 200 with error note so client SDK never crashes or blocks UI
    return NextResponse.json(
      { success: false, error: 'Ingest error' },
      { status: 200 },
    );
  }
}
