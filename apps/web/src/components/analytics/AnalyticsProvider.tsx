'use client';

import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useRef } from 'react';
import {
  analytics,
  FeatureId,
  IAnalytics,
  isSensitiveElement,
  sanitizeText,
} from '@applyso/analytics';
import { authClient } from '@/lib/auth-client';

const AnalyticsContext = createContext<IAnalytics>(analytics);

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

function getFeatureFromPath(pathname: string): FeatureId {
  if (pathname === '/dashboard') return 'overview';
  if (pathname.startsWith('/dashboard/auto-apply')) return 'resume_builder';
  if (pathname.startsWith('/dashboard/discovery')) return 'job_discovery';
  if (pathname.startsWith('/dashboard/workflows')) return 'workflows';
  if (pathname.startsWith('/dashboard/linkedin')) return 'linkedin_outreach';
  if (pathname.startsWith('/dashboard/settings/billing'))
    return 'settings_billing';
  if (pathname.startsWith('/dashboard/settings/security'))
    return 'settings_security';
  if (pathname.startsWith('/dashboard/settings/preferences'))
    return 'settings_preferences';
  if (pathname.startsWith('/dashboard/settings')) return 'settings_profile';
  if (pathname === '/login' || pathname === '/signup') return 'auth';
  return 'overview';
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();
  const lastTrackedPath = useRef<string | null>(null);

  // Sync user identity when logged in
  useEffect(() => {
    if (session?.user?.id) {
      analytics.identify(session.user.id);
    } else {
      analytics.identify(null);
    }
  }, [session?.user?.id]);

  // Track page views on route change
  useEffect(() => {
    if (!pathname || pathname === lastTrackedPath.current) return;
    lastTrackedPath.current = pathname;

    const feature = getFeatureFromPath(pathname);
    analytics.page(pathname, {
      feature,
      title: typeof document !== 'undefined' ? document.title : undefined,
    });
  }, [pathname]);

  // Privacy-Aware Autocapture: Safe Click Listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    function handleClick(event: MouseEvent) {
      try {
        const target = event.target as HTMLElement | null;
        if (!target) return;

        // Skip sensitive elements outright
        if (isSensitiveElement(target)) return;

        // Find nearest interactive element
        const interactive = target.closest<HTMLElement>(
          'button, a, [role="button"], [data-analytics-event], input[type="checkbox"], input[type="radio"], select',
        );

        if (!interactive || isSensitiveElement(interactive)) return;

        const tagName = interactive.tagName.toLowerCase();
        const customEvent = interactive.getAttribute('data-analytics-event');
        const customFeature = (interactive.getAttribute('data-feature') ||
          interactive
            .closest('[data-feature]')
            ?.getAttribute('data-feature')) as FeatureId | null;

        const currentFeature =
          customFeature ||
          (pathname ? getFeatureFromPath(pathname) : 'overview');

        // Extract safe element label
        const rawLabel =
          interactive.getAttribute('aria-label') ||
          interactive.getAttribute('title') ||
          interactive.getAttribute('data-analytics-label') ||
          interactive.innerText;

        const safeLabel = sanitizeText(rawLabel, 40);

        let elementType = tagName;
        if (interactive.getAttribute('role') === 'button')
          elementType = 'button';
        else if (tagName === 'input')
          elementType = interactive.getAttribute('type') || 'input';

        let targetUrl: string | undefined = undefined;
        if (tagName === 'a') {
          const href = (interactive as HTMLAnchorElement).href;
          if (href && !href.startsWith('javascript:')) {
            try {
              const url = new URL(href, window.location.origin);
              targetUrl = url.pathname;
            } catch {}
          }
        }

        analytics.track('element_clicked', {
          element_id: customEvent || interactive.id || undefined,
          element_type: elementType,
          feature: currentFeature,
          label: safeLabel,
          target_url: targetUrl,
        });
      } catch {
        // Autocapture listener failure should never break UI
      }
    }

    document.addEventListener('click', handleClick, {
      passive: true,
      capture: true,
    });

    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
    };
  }, [pathname]);

  return (
    <AnalyticsContext.Provider value={analytics}>
      {children}
    </AnalyticsContext.Provider>
  );
}
