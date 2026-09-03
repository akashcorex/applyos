import { analyticsEvents, analyticsIdentities, db } from '@applyso/database';

import { sanitizeProperties } from './sanitizer';
import {
  type AnalyticsEventMap,
  type EventName,
  type FeatureId,
} from './types';

export interface ServerEventOptions<K extends EventName> {
  event: K;
  userId?: string | null;
  anonymousId?: string;
  sessionId?: string;
  feature?: FeatureId;
  page?: string;
  component?: string;
  properties: AnalyticsEventMap[K];
  context?: Record<string, unknown>;
  environment?: 'development' | 'staging' | 'production' | 'test';
}

/**
 * Emits a server-side authoritative domain event directly to the database.
 */
export async function trackServerEvent<K extends EventName>(
  options: ServerEventOptions<K>,
): Promise<void> {
  try {
    const sanitizedProps = sanitizeProperties(
      options.properties as Record<string, unknown>,
    );

    await db.insert(analyticsEvents).values({
      eventId: crypto.randomUUID(),
      eventName: options.event,
      feature: options.feature,
      userId: options.userId ?? null,
      anonymousId: options.anonymousId || 'server_anonymous',
      sessionId: options.sessionId || 'server_session',
      page: options.page,
      component: options.component,
      source: 'server',
      properties: sanitizedProps,
      context: options.context || { platform: 'node' },
      environment:
        options.environment ||
        (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('[Analytics] Failed to write server event:', err);
  }
}

/**
 * Links an anonymous identity to an authenticated user ID upon signup / login.
 */
export async function linkAnonymousIdentity(
  userId: string,
  anonymousId: string,
): Promise<void> {
  if (!userId || !anonymousId || anonymousId === 'server_anonymous') return;

  try {
    await db.insert(analyticsIdentities).values({
      userId,
      anonymousId,
      firstSeenAt: new Date(),
      linkedAt: new Date(),
    });
  } catch (err) {
    console.error('[Analytics] Failed to link anonymous identity:', err);
  }
}
