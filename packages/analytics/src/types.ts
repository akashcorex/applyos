/**
 * Canonical Feature Taxonomy for ApplyOS
 */
export type FeatureId =
  | 'overview'
  | 'resume_builder'
  | 'job_discovery'
  | 'workflows'
  | 'linkedin_outreach'
  | 'settings_profile'
  | 'settings_billing'
  | 'settings_security'
  | 'settings_preferences'
  | 'auth'
  | 'navigation'
  | 'system';

/**
 * Event Context
 */
export interface EventContext {
  platform?: 'web' | 'mobile_web' | 'node' | 'agent';
  appVersion?: string;
  environment?: 'development' | 'staging' | 'production' | 'test';
  locale?: string;
  timezone?: string;
  userAgent?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  [key: string]: unknown;
}

/**
 * Complete strongly-typed event definitions map
 */
export interface AnalyticsEventMap {
  // --- Layer 1: Core Lifecycle & Autocapture ---
  page_viewed: {
    path: string;
    referrer?: string;
    title?: string;
    feature?: FeatureId;
  };
  session_started: {
    is_new_user: boolean;
    referrer?: string;
    entry_path?: string;
  };
  session_ended: {
    duration_seconds: number;
    total_events?: number;
  };
  element_clicked: {
    element_id?: string;
    element_type: string;
    feature?: FeatureId;
    label?: string;
    target_url?: string;
  };
  tab_changed: {
    feature: FeatureId;
    tab_name: string;
  };
  modal_opened: {
    modal_id: string;
    feature?: FeatureId;
  };
  modal_closed: {
    modal_id: string;
    feature?: FeatureId;
    duration_ms?: number;
  };
  theme_toggled: {
    theme: 'dark' | 'light' | 'system';
  };
  sidebar_toggled: {
    is_collapsed: boolean;
  };

  // --- Layer 2: Feature: Resume Builder & Tailoring ---
  resume_uploaded: {
    file_type: string;
    file_size_bucket: '<1mb' | '1-5mb' | '>5mb';
  };
  resume_parse_started: {
    resume_id?: string;
  };
  resume_parse_completed: {
    resume_id: string;
    duration_ms: number;
    section_count?: number;
    skill_count?: number;
  };
  resume_parse_failed: {
    resume_id?: string;
    error_code: string;
    duration_ms?: number;
  };
  resume_tailor_started: {
    job_title: string;
    company_name: string;
  };
  resume_tailor_completed: {
    duration_ms: number;
    baseline_score?: number;
    optimized_score?: number;
    suggestions_count?: number;
  };
  resume_tailor_failed: {
    error_code: string;
    duration_ms: number;
  };
  resume_variant_saved: {
    variant_id: string;
    match_score?: number;
  };
  resume_variant_previewed: {
    variant_id: string;
  };
  resume_downloaded: {
    format: 'pdf' | 'json';
    variant_id?: string;
  };

  // --- Layer 2: Feature: Job Discovery ---
  job_search_started: {
    query?: string;
    source: 'company_scrape' | 'manual';
  };
  job_search_completed: {
    result_count: number;
    duration_ms: number;
    companies_count?: number;
  };
  job_search_failed: {
    error_code: string;
  };
  job_result_clicked: {
    company_name: string;
    job_title: string;
    position_index?: number;
  };
  job_selected: {
    company_name: string;
    job_title: string;
    ats_type?: string;
  };

  // --- Layer 2: Feature: Workflows & Autonomous Applications ---
  workflow_started: {
    task_count: number;
    is_fast_mode?: boolean;
  };
  workflow_paused: {
    current_step?: string;
  };
  workflow_resumed: {
    current_step?: string;
  };
  workflow_cancelled: {
    completed_count: number;
    total_count: number;
  };
  application_submitted_success: {
    company_name: string;
    job_title: string;
    duration_ms: number;
  };
  application_submitted_failed: {
    company_name: string;
    job_title?: string;
    error_code: string;
    duration_ms: number;
  };

  // --- Layer 2: Feature: LinkedIn Outreach ---
  linkedin_connect_toggled: {
    enabled: boolean;
  };
  linkedin_sync_started: {};
  linkedin_sync_completed: {
    connects_sent: number;
    duration_ms: number;
  };
  linkedin_sync_failed: {
    error_code: string;
  };

  // --- Layer 2: Feature: Settings, Account & Billing ---
  plan_viewed: {
    current_plan: string;
  };
  plan_upgrade_clicked: {
    target_plan: string;
    billing_cycle: 'monthly' | 'yearly';
  };
  preferences_updated: {
    auto_apply_enabled?: boolean;
    max_daily_apps?: number;
    min_match_score?: number;
  };
  security_password_updated: {};

  // --- Layer 2: Feature: Auth & Identity ---
  sign_up_started: {
    method: 'email' | 'google';
  };
  sign_up_completed: {
    method: 'email' | 'google';
  };
  login_completed: {
    method: 'email' | 'google';
  };
  logout_completed: {};
}

export type EventName = keyof AnalyticsEventMap;

/**
 * Envelope for a single dispatched event
 */
export interface AnalyticsPayload<K extends EventName = EventName> {
  eventId: string;
  event: K;
  feature?: FeatureId;
  userId?: string | null;
  anonymousId: string;
  sessionId: string;
  page?: string;
  component?: string;
  source: 'client' | 'server';
  properties: AnalyticsEventMap[K];
  context: EventContext;
  environment: 'development' | 'staging' | 'production' | 'test';
  timestamp: string; // ISO 8601
}
