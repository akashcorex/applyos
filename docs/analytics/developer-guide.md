# ApplyOS Product Analytics Developer Guide

This guide explains how to instrument, add, and query analytics events across ApplyOS.

---

## 1. Quick Start: Instrumenting Client Components

### Basic Usage with `analytics.track`

```tsx
import { analytics } from '@applyso/analytics';

// Inside any client component or event handler
function handleExport() {
  analytics.track(
    'resume_downloaded',
    {
      format: 'pdf',
      variant_id: variant.id,
    },
    { feature: 'resume_builder' },
  );

  // Proceed with business logic
  exportPDF();
}
```

### Scoped Feature Logger with `analytics.feature`

```tsx
import { analytics } from '@applyso/analytics';

const featureLogger = analytics.feature('job_discovery');

featureLogger.track('job_selected', {
  company_name: 'Google',
  job_title: 'Senior Frontend Engineer',
  ats_type: 'greenhouse',
});
```

---

## 2. Server-Side Telemetry (`trackServerEvent`)

In API route handlers, background queue jobs, or agent runners:

```typescript
import { trackServerEvent } from '@applyso/analytics/server';

export async function POST(req: Request) {
  const startTime = Date.now();

  try {
    const result = await processApplication();

    await trackServerEvent({
      event: 'application_submitted_success',
      userId: user.id,
      sessionId: req.headers.get('x-session-id') || undefined,
      feature: 'workflows',
      properties: {
        company_name: result.company,
        job_title: result.title,
        duration_ms: Date.now() - startTime,
      },
    });

    return Response.json({ success: true });
  } catch (err) {
    await trackServerEvent({
      event: 'application_submitted_failed',
      userId: user.id,
      feature: 'workflows',
      properties: {
        company_name: targetCompany,
        error_code: 'CAPTCHA_BLOCKED',
        duration_ms: Date.now() - startTime,
      },
    });
    throw err;
  }
}
```

---

## 3. How to Add a New Event

1. **Update the TypeScript Event Map**:
   Open [`packages/analytics/src/types.ts`](file:///Users/akashlaha/Documents/Projects/applyos.in/packages/analytics/src/types.ts) and declare your event in `AnalyticsEventMap`:
   ```typescript
   export interface AnalyticsEventMap {
     // ... existing events ...
     interview_prep_started: {
       company_name: string;
       question_count: number;
     };
   }
   ```
2. **Document in Tracking Plan**:
   Add the event trigger, properties, and ownership to [`docs/analytics/tracking-plan.md`](file:///Users/akashlaha/Documents/Projects/applyos.in/docs/analytics/tracking-plan.md).
3. **Instrument in Code**:
   Call `analytics.track('interview_prep_started', { ... })`. TypeScript will automatically enforce required properties and fail if property types don't match!

---

## 4. Privacy & Autocapture Rules

- **Zero Input Values**: The autocapture layer strictly ignores `<input>`, `<textarea>`, and `[contenteditable]` values.
- **Explicit Element Ignore**: If you have a sensitive element or widget that should never be tracked, add `data-analytics-ignore`:
  ```tsx
  <div data-analytics-ignore>
    <SensitiveComponent />
  </div>
  ```
- **Explicit Feature Tags**: Tag parent sections to auto-attribute nested click events:
  ```tsx
  <div data-feature="resume_builder">
    <button>Tailor AI</button>
  </div>
  ```

---

## 5. Querying Behavioral Data in PostgreSQL

### Measure Feature Adoption Rate

```sql
SELECT
  feature,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(*) AS total_events
FROM analytics_events
WHERE timestamp >= NOW() - INTERVAL '7 days'
GROUP BY feature
ORDER BY total_events DESC;
```

### Resume Builder Funnel Conversion

```sql
SELECT
  COUNT(DISTINCT CASE WHEN event_name = 'page_viewed' AND page = '/dashboard/auto-apply' THEN user_id END) AS step_1_viewed,
  COUNT(DISTINCT CASE WHEN event_name = 'resume_uploaded' THEN user_id END) AS step_2_uploaded,
  COUNT(DISTINCT CASE WHEN event_name = 'resume_tailor_started' THEN user_id END) AS step_3_tailored,
  COUNT(DISTINCT CASE WHEN event_name = 'resume_variant_saved' THEN user_id END) AS step_4_saved
FROM analytics_events
WHERE timestamp >= NOW() - INTERVAL '30 days';
```
