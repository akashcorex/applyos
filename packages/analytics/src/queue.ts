import { type AnalyticsPayload } from './types';

const FLUSH_INTERVAL_MS = 5000;
const MAX_BATCH_SIZE = 15;

export class AnalyticsQueue {
  private buffer: AnalyticsPayload[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private endpoint: string;

  constructor(endpoint = '/api/analytics') {
    this.endpoint = endpoint;
    this.init();
  }

  private init() {
    if (typeof window === 'undefined') return;

    // Periodic flush timer
    this.timer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush();
      }
    }, FLUSH_INTERVAL_MS);

    // Lifecycle flush listeners
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void this.flush(true);
      }
    });

    window.addEventListener('pagehide', () => {
      void this.flush(true);
    });
  }

  public enqueue(event: AnalyticsPayload) {
    this.buffer.push(event);

    if (this.buffer.length >= MAX_BATCH_SIZE) {
      void this.flush();
    }
  }

  public async flush(useBeacon = false): Promise<void> {
    if (this.buffer.length === 0) return;

    const eventsToFlush = [...this.buffer];
    this.buffer = [];

    const body = JSON.stringify({ events: eventsToFlush });

    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      try {
        const success = navigator.sendBeacon(
          this.endpoint,
          new Blob([body], { type: 'application/json' }),
        );
        if (success) return;
      } catch {
        // Fallback to fetch keepalive
      }
    }

    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
    } catch {
      // Re-queue events on temporary network glitch if buffer isn't overflowing
      if (this.buffer.length < 50) {
        this.buffer.unshift(...eventsToFlush);
      }
    }
  }

  public destroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}
