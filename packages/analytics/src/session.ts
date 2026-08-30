/**
 * Session and Identity Manager
 */

const ANON_ID_STORAGE_KEY = 'applyos_analytics_anon_id';
const SESSION_ID_STORAGE_KEY = 'applyos_analytics_session_id';
const SESSION_ACTIVITY_KEY = 'applyos_analytics_last_active';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Retrieves or generates the persistent anonymous ID.
 */
export function getOrCreateAnonymousId(): string {
  if (typeof window === 'undefined') return 'server_anonymous';

  try {
    let id = localStorage.getItem(ANON_ID_STORAGE_KEY);
    if (!id) {
      id = generateUUID();
      localStorage.setItem(ANON_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return generateUUID();
  }
}

export interface SessionState {
  sessionId: string;
  isNewSession: boolean;
}

/**
 * Retrieves the current active session ID or starts a new one if expired.
 */
export function getOrCreateSession(): SessionState {
  if (typeof window === 'undefined') {
    return { sessionId: 'server_session', isNewSession: false };
  }

  const now = Date.now();

  try {
    const lastActiveStr = localStorage.getItem(SESSION_ACTIVITY_KEY);
    const existingSessionId = localStorage.getItem(SESSION_ID_STORAGE_KEY);

    const lastActive = lastActiveStr ? parseInt(lastActiveStr, 10) : 0;
    const isExpired = !lastActive || now - lastActive > SESSION_TIMEOUT_MS;

    if (!existingSessionId || isExpired) {
      const newSessionId = generateUUID();
      localStorage.setItem(SESSION_ID_STORAGE_KEY, newSessionId);
      localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
      return { sessionId: newSessionId, isNewSession: true };
    }

    // Refresh activity timestamp
    localStorage.setItem(SESSION_ACTIVITY_KEY, String(now));
    return { sessionId: existingSessionId, isNewSession: false };
  } catch {
    return { sessionId: generateUUID(), isNewSession: true };
  }
}

/**
 * Updates the last active session timestamp.
 */
export function touchSessionActivity(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SESSION_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}
