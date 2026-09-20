'use client';

import type { AnchorHTMLAttributes, ReactNode } from 'react';

/**
 * Allowlist for user-supplied URLs. Stored profile links are rendered as
 * clickable anchors — without this, a saved `javascript:` / `data:` URL
 * becomes stored self-XSS.
 */
export function isSafeExternalUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed) ||
    // Bare domains like "github.com/foo" — normalized to https:// on render.
    /^[^/:?\s]+\.[^/:?\s]+(\/.*)?$/.test(trimmed)
  );
}

/** Prepend https:// to bare domains; return null when unsafe. */
export function normalizeExternalUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) return trimmed;
  if (/^[^/:?\s]+\.[^/:?\s]+(\/.*)?$/.test(trimmed)) return `https://${trimmed}`;
  return null;
}

interface SafeExternalLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string | null | undefined;
  children: ReactNode;
}

/** Anchor that never renders unsafe hrefs; drops to null instead of XSS. */
export function SafeExternalLink({
  href,
  children,
  rel,
  target = '_blank',
  ...rest
}: SafeExternalLinkProps) {
  const safeHref = normalizeExternalUrl(href);
  if (!safeHref) return null;
  return (
    <a href={safeHref} target={target} rel={rel ?? 'noopener noreferrer'} {...rest}>
      {children}
    </a>
  );
}
