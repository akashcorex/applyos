import { AnalyticsQueue } from './queue';
import { sanitizeProperties } from './sanitizer';
import {
  getOrCreateAnonymousId,
  getOrCreateSession,
  touchSessionActivity,
} from './session';
import {
  type AnalyticsEventMap,
  type AnalyticsPayload,
  type EventContext,
  type EventName,
  type FeatureId,
} from './types';

export interface IAnalytics {
  identify(userId: string | null): void;
  track<K extends EventName>(
    event: K,
    properties: AnalyticsEventMap[K],
    options?: {
      feature?: FeatureId;
      page?: string;
      component?: string;
    },
  ): void;
  page(path: string, options?: { feature?: FeatureId; title?: string }): void;
  feature(feature: FeatureId): {
    track: <K extends EventName>(
      event: K,
      properties: AnalyticsEventMap[K],
      component?: string,
    ) => void;
  };
  flush(): Promise<void>;
}

export class ClientAnalytics implements IAnalytics {
  private queue: AnalyticsQueue;
  private currentUserId: string | null = null;
  private environment: 'development' | 'staging' | 'production' | 'test' =
    'development';
  private appVersion = '0.0.1';

  constructor() {
    this.queue = new AnalyticsQueue('/api/analytics');

    if (typeof process !== 'undefined' && process.env.NODE_ENV) {
      if (process.env.NODE_ENV === 'production')
        this.environment = 'production';
      else if (process.env.NODE_ENV === 'test') this.environment = 'test';
    }
  }

  public identify(userId: string | null): void {
    this.currentUserId = userId;
  }

  private getContext(): EventContext {
    if (typeof window === 'undefined') {
      return {
        platform: 'web',
        environment: this.environment,
        appVersion: this.appVersion,
      };
    }

    return {
      platform: 'web',
      appVersion: this.appVersion,
      environment: this.environment,
      locale: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      userAgent: navigator.userAgent,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  public track<K extends EventName>(
    event: K,
    properties: AnalyticsEventMap[K],
    options?: {
      feature?: FeatureId;
      page?: string;
      component?: string;
    },
  ): void {
    if (typeof window === 'undefined') return;

    touchSessionActivity();
    const anonymousId = getOrCreateAnonymousId();
    const { sessionId } = getOrCreateSession();

    const sanitizedProps = sanitizeProperties(
      properties as Record<string, unknown>,
    ) as AnalyticsEventMap[K];

    const payload: AnalyticsPayload<K> = {
      eventId: crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now() + Math.random()),
      event,
      feature: options?.feature,
      userId: this.currentUserId,
      anonymousId,
      sessionId,
      page:
        options?.page ||
        (typeof window !== 'undefined' ? window.location.pathname : undefined),
      component: options?.component,
      source: 'client',
      properties: sanitizedProps,
      context: this.getContext(),
      environment: this.environment,
      timestamp: new Date().toISOString(),
    };

    this.queue.enqueue(payload as AnalyticsPayload);
  }

  public page(
    path: string,
    options?: { feature?: FeatureId; title?: string },
  ): void {
    this.track('page_viewed', {
      path,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      title:
        options?.title ||
        (typeof document !== 'undefined' ? document.title : undefined),
      feature: options?.feature,
    });
  }

  public feature(feature: FeatureId) {
    return {
      track: <K extends EventName>(
        event: K,
        properties: AnalyticsEventMap[K],
        component?: string,
      ) => {
        this.track(event, properties, { feature, component });
      },
    };
  }

  public async flush(): Promise<void> {
    await this.queue.flush();
  }
}

export const analytics = new ClientAnalytics();
