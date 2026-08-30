/**
 * Privacy Sanitizer & PII Protection Layer
 */

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const JWT_REGEX = /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g;

/**
 * Sanitizes arbitrary text strings to strip emails, phone numbers, and secrets.
 */
export function sanitizeText(
  text: string | null | undefined,
  maxLength = 60,
): string | undefined {
  if (!text) return undefined;

  let cleaned = text
    .replace(EMAIL_REGEX, '[MASKED_EMAIL]')
    .replace(PHONE_REGEX, '[MASKED_PHONE]')
    .replace(JWT_REGEX, '[MASKED_TOKEN]')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length > maxLength) {
    cleaned = cleaned.slice(0, maxLength) + '…';
  }

  return cleaned || undefined;
}

/**
 * Determines whether a DOM element should be ignored from autocapture.
 */
export function isSensitiveElement(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  const type = (element.getAttribute('type') || '').toLowerCase();

  // Always ignore password, hidden, or credential inputs
  if (
    tagName === 'input' &&
    ['password', 'hidden', 'email', 'tel'].includes(type)
  ) {
    return true;
  }

  // Explicit opt-out flag via data attribute
  if (
    element.hasAttribute('data-analytics-ignore') ||
    element.closest('[data-analytics-ignore]')
  ) {
    return true;
  }

  // Ignore editable content areas
  if (element.isContentEditable || tagName === 'textarea') {
    return true;
  }

  return false;
}

/**
 * Deep sanitization of event properties object
 */
export function sanitizeProperties<T extends Record<string, unknown>>(
  props: T,
): T {
  if (!props || typeof props !== 'object') return props;

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(props)) {
    const lowerKey = key.toLowerCase();

    // Block sensitive property names outright
    if (
      lowerKey.includes('password') ||
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('rawtext') ||
      lowerKey.includes('resume_text') ||
      lowerKey.includes('prompt') ||
      lowerKey.includes('cookie')
    ) {
      continue;
    }

    if (typeof value === 'string') {
      result[key] = sanitizeText(value, 120);
    } else if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      result[key] = value;
    } else if (Array.isArray(value)) {
      result[key] = value
        .slice(0, 20)
        .map((item) =>
          typeof item === 'string' ? sanitizeText(item, 80) : item,
        );
    } else if (typeof value === 'object') {
      result[key] = sanitizeProperties(value as Record<string, unknown>);
    }
  }

  return result as T;
}
