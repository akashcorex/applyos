# ApplyOS Tracking Plan & Canonical Data Dictionary

This document is the authoritative tracking plan and contract between Product, Engineering, and Analytics for ApplyOS.

---

## 1. Global Event Contract Schema

Every event dispatched by ApplyOS follows this canonical envelope:

```typescript
interface AnalyticsPayload<K extends EventName> {
  eventId: string; // UUIDv4
  event: K; // Canonical snake_case event name
  feature?: FeatureId; // First-class feature taxonomy identifier
  userId?: string | null; // Authenticated user ID (if logged in)
  anonymousId: string; // Persistent visitor UUID across sessions
  sessionId: string; // 30-minute rolling session UUID
  page?: string; // Current path (e.g., /dashboard/auto-apply)
  component?: string; // Originating UI component
  source: 'client' | 'server';
  properties: AnalyticsEventMap[K];
  context: {
    platform: 'web' | 'mobile_web' | 'node' | 'agent';
    appVersion: string;
    environment: 'development' | 'staging' | 'production';
    locale?: string;
    timezone?: string;
  };
  timestamp: string; // ISO 8601 UTC timestamp
}
```

---

## 2. Feature Taxonomy

| Feature ID             | Description                                          | Primary Route / Surface           |
| :--------------------- | :--------------------------------------------------- | :-------------------------------- |
| `overview`             | Dashboard KPIs, Velocity Chart, live stream          | `/dashboard`                      |
| `resume_builder`       | Resume parsing, variants, tailoring, document editor | `/dashboard/auto-apply`           |
| `job_discovery`        | Company scraper, ATS detection, live search          | `/dashboard/discovery`            |
| `workflows`            | Autonomous application queues, live agent execution  | `/dashboard/workflows`            |
| `linkedin_outreach`    | LinkedIn OAuth connection & post-apply automation    | `/dashboard/linkedin`             |
| `settings_profile`     | Candidate profile, target titles, locations          | `/dashboard/settings`             |
| `settings_billing`     | Subscription plans, billing cycles, checkout         | `/dashboard/settings/billing`     |
| `settings_security`    | Password updates, active browser sessions            | `/dashboard/settings/security`    |
| `settings_preferences` | Throughput limits, jitter, duplicate protection      | `/dashboard/settings/preferences` |
| `auth`                 | Signup, login, Google OAuth, session restore         | `/login`, `/signup`               |
| `navigation`           | Sidebar collapse/expand, command search              | Global shell                      |
| `system`               | Dark/light theme toggling, error boundaries          | Global app                        |

---

## 3. Canonical Events Catalog

### Layer 1: Core Lifecycle & Autocapture

#### `page_viewed`

- **Trigger**: Next.js route transition or initial page render.
- **Source**: Client (`AnalyticsProvider`)
- **Properties**:
  - `path` (`string`, required): Relative route path (e.g. `/dashboard/auto-apply`).
  - `referrer` (`string`, optional): Document referrer URL.
  - `title` (`string`, optional): Document page title.
  - `feature` (`FeatureId`, optional): Auto-mapped feature taxonomy ID.
- **PII**: None.

#### `session_started`

- **Trigger**: New browser visit or after 30 minutes of user inactivity.
- **Source**: Client (`session.ts`)
- **Properties**:
  - `is_new_user` (`boolean`, required): True if no prior anonymous ID existed.
  - `referrer` (`string`, optional): Entry referrer.
- **PII**: None.

#### `session_ended`

- **Trigger**: Session expiry or page unload after activity.
- **Source**: Client
- **Properties**:
  - `duration_seconds` (`number`, required): Active session length.
- **PII**: None.

#### `element_clicked`

- **Trigger**: User clicks a button, link, tab, or interactive UI element.
- **Source**: Client (`AnalyticsProvider` safe click listener)
- **Properties**:
  - `element_id` (`string`, optional): Element ID or `data-analytics-event`.
  - `element_type` (`string`, required): Tag or role (`button`, `a`, `checkbox`).
  - `feature` (`FeatureId`, optional): Active feature domain.
  - `label` (`string`, optional): Sanitized, truncated button label (max 40 chars).
  - `target_url` (`string`, optional): Relative target URL for navigation links.
- **PII**: Strictly masked. Input text, passwords, and sensitive fields are ignored.

#### `theme_toggled`

- **Trigger**: User switches between Dark and Light mode.
- **Source**: Client (`ThemeToggle.tsx`)
- **Properties**:
  - `theme` (`'dark' | 'light' | 'system'`, required).
- **PII**: None.

#### `sidebar_toggled`

- **Trigger**: User toggles the Collapseify button or sidebar rail mode.
- **Source**: Client (`DashboardAppLayout.tsx`)
- **Properties**:
  - `is_collapsed` (`boolean`, required).
- **PII**: None.

---

### Layer 2: Feature: Resume Builder & Tailoring

#### `resume_uploaded`

- **Trigger**: User selects and uploads a resume document.
- **Source**: Client (`ResumeAutoApplyCard.tsx`)
- **Properties**:
  - `file_type` (`string`, required): Extension or MIME (e.g., `pdf`, `docx`).
  - `file_size_bucket` (`'<1mb' | '1-5mb' | '>5mb'`, required): Safe size range.
- **PII**: Zero. Never stores file name or file content.

#### `resume_parse_started`

- **Trigger**: Client dispatches resume parsing request to `/api/resume/parse`.
- **Source**: Client / Server
- **Properties**:
  - `resume_id` (`string`, optional).
- **PII**: None.

#### `resume_parse_completed`

- **Trigger**: Resume parser finishes extracting candidate work history & skills.
- **Source**: Client / Server
- **Properties**:
  - `resume_id` (`string`, required): Database resume UUID.
  - `duration_ms` (`number`, required): Total extraction elapsed time.
  - `skill_count` (`number`, optional): Number of skills extracted.
- **PII**: None.

#### `resume_parse_failed`

- **Trigger**: Resume parsing agent fails or returns non-200.
- **Source**: Client / Server
- **Properties**:
  - `error_code` (`string`, required): Diagnostic category code.
  - `duration_ms` (`number`, required).
- **PII**: None.

#### `resume_tailor_started`

- **Trigger**: User clicks tailor variant for a specific targeted company.
- **Source**: Client (`ResumeVariantEditor.tsx`)
- **Properties**:
  - `job_title` (`string`, required).
  - `company_name` (`string`, required).
- **PII**: None.

#### `resume_variant_saved`

- **Trigger**: User saves an edited or tailored resume draft.
- **Source**: Client (`ResumeVariantEditor.tsx`)
- **Properties**:
  - `variant_id` (`string`, required): Resume variant UUID.
  - `match_score` (`number`, optional): Calculated ATS match percentage.
- **PII**: None.

#### `resume_downloaded`

- **Trigger**: User exports or downloads a generated PDF variant.
- **Source**: Client
- **Properties**:
  - `format` (`'pdf' | 'json'`, required).
  - `variant_id` (`string`, optional).
- **PII**: None.

---

### Layer 3: Feature: Job Discovery

#### `job_search_started`

- **Trigger**: User submits a live company search or keyword query.
- **Source**: Client (`CompanyDiscoveryPanel.tsx`)
- **Properties**:
  - `query` (`string`, optional): Search keyword.
  - `source` (`'company_scrape' | 'manual'`, required).
- **PII**: None.

#### `job_search_completed`

- **Trigger**: Scraper finishes discovering and matching job listings.
- **Source**: Client (`CompanyDiscoveryPanel.tsx`)
- **Properties**:
  - `result_count` (`number`, required): Total jobs matched.
  - `duration_ms` (`number`, required): Time taken to query ATS endpoints.
  - `companies_count` (`number`, optional): Total companies scraped.
- **PII**: None.

#### `job_search_failed`

- **Trigger**: Scraping service fails or times out.
- **Source**: Client (`CompanyDiscoveryPanel.tsx`)
- **Properties**:
  - `error_code` (`string`, required).
- **PII**: None.

---

### Layer 4: Feature: Workflows & Autonomous Applications

#### `workflow_started`

- **Trigger**: User dispatches an autonomous auto-apply queue.
- **Source**: Client (`WorkflowPanel.tsx` / `ResumeAutoApplyCard.tsx`)
- **Properties**:
  - `task_count` (`number`, required): Total job applications queued.
  - `is_fast_mode` (`boolean`, optional): Parallel execution mode flag.
- **PII**: None.

#### `workflow_paused`

- **Trigger**: User pauses an in-progress auto-apply pipeline.
- **Source**: Client (`WorkflowPanel.tsx`)
- **Properties**:
  - `current_step` (`string`, optional): Workflow stage when paused.
- **PII**: None.

#### `workflow_resumed`

- **Trigger**: User resumes a paused application pipeline.
- **Source**: Client (`WorkflowPanel.tsx`)
- **Properties**:
  - `current_step` (`string`, optional).
- **PII**: None.

#### `workflow_cancelled`

- **Trigger**: User stops or terminates an application pipeline.
- **Source**: Client (`WorkflowPanel.tsx`)
- **Properties**:
  - `completed_count` (`number`, required): Applications finished before cancellation.
  - `total_count` (`number`, required): Initial queue total.
- **PII**: None.

#### `application_submitted_success`

- **Trigger**: Browser automation agent successfully confirms form submission on company ATS.
- **Source**: Server (`apply-agent` / `apps/api`)
- **Properties**:
  - `company_name` (`string`, required).
  - `job_title` (`string`, required).
  - `duration_ms` (`number`, required).
- **PII**: None.

#### `application_submitted_failed`

- **Trigger**: Browser automation agent encounters an obstacle or ATS captcha.
- **Source**: Server (`apply-agent` / `apps/api`)
- **Properties**:
  - `company_name` (`string`, required).
  - `error_code` (`string`, required): e.g., `CAPTCHA_REQUIRED`, `FIELD_MISSING`.
  - `duration_ms` (`number`, required).
- **PII**: None.

---

### Layer 5: Feature: LinkedIn Outreach

#### `linkedin_connect_toggled`

- **Trigger**: User enables or disables post-apply connection automation.
- **Source**: Client (`LinkedInConnectCard.tsx`)
- **Properties**:
  - `enabled` (`boolean`, required).
- **PII**: None.

#### `linkedin_sync_completed`

- **Trigger**: Outreach agent finishes daily connection quota.
- **Source**: Server (`outreach-agent` / `apps/api`)
- **Properties**:
  - `connects_sent` (`number`, required).
  - `duration_ms` (`number`, required).
- **PII**: None.

---

### Layer 6: Feature: Settings & Billing

#### `plan_viewed`

- **Trigger**: User views subscription comparison table.
- **Source**: Client (`billing/page.tsx`)
- **Properties**:
  - `current_plan` (`string`, required): e.g., `pro` or `starter`.
- **PII**: None.

#### `plan_upgrade_clicked`

- **Trigger**: User clicks upgrade CTA button on a pricing tier.
- **Source**: Client (`billing/page.tsx`)
- **Properties**:
  - `target_plan` (`string`, required): Plan ID selected.
  - `billing_cycle` (`'monthly' | 'yearly'`, required).
- **PII**: None.

#### `preferences_updated`

- **Trigger**: User saves application rate limits or minimum match thresholds.
- **Source**: Client (`preferences/page.tsx`)
- **Properties**:
  - `auto_apply_enabled` (`boolean`, optional).
  - `max_daily_apps` (`number`, optional).
  - `min_match_score` (`number`, optional).
- **PII**: None.
