/**
 * Shared types for the Growth cockpit. ArtistStatsRow mirrors the
 * growth_artist_stats view (migration 0067) exactly, snake_case as returned
 * by PostgREST. Pure types only, importable from client and server.
 */

export type ArtistStatsRow = {
  id: string;
  slug: string;
  display_name: string;
  is_tester: boolean;
  account_status: string;
  soft_deleted: boolean;
  booking_mode: string;
  timezone: string;
  account_created_at: string | null;
  profile_claimed_at: string;
  last_sign_in_at: string | null;
  email_confirmed: boolean | null;
  onboarding_completed: boolean;
  ever_completed_onboarding: boolean;
  books_configured: boolean;
  books_open_flag: boolean;
  booking_window_ends_at: string | null;
  form_configured: boolean;
  profile_info_set: boolean;
  stripe_account_status: string | null;
  attribution_source: string | null;
  attribution_medium: string | null;
  attribution_campaign: string | null;
  attribution_referrer: string | null;
  attribution_entry_path: string | null;
  attribution_platform: string | null;
  total_requests: number;
  pending_requests: number;
  approved_requests: number;
  rejected_requests: number;
  cancelled_requests: number;
  artist_created_requests: number;
  first_request_at: string | null;
  last_request_at: string | null;
  deposits_requested: number;
  deposits_paid: number;
  first_deposit_paid_at: string | null;
  first_approved_at: string | null;
  last_decision_at: string | null;
  slot_count: number;
  first_slot_created_at: string | null;
  trip_count: number;
  published_trip_count: number;
  first_trip_at: string | null;
  flash_count: number;
  published_flash_count: number;
  first_flash_at: string | null;
  waitlist_count: number;
  custom_field_count: number;
  email_template_count: number;
  instagram_connected: boolean;
  device_platforms: string[] | null;
  last_mobile_seen_at: string | null;
  first_device_at: string | null;
  support_ticket_count: number;
  onboarding_completed_event_at: string | null;
  link_copied_count: number;
  lifecycle_sends: number;
  last_lifecycle_send_at: string | null;
  last_activity_at: string | null;
  last_presence_day: string | null;
  presence_days_90: number | null;
};

export type ActivityDayRow = {
  artist_id: string;
  day: string; // YYYY-MM-DD
  actions: number;
  presence: boolean;
};

export type SignupSeriesRow = {
  bucket: string;
  auth_signups: number;
  profiles_claimed: number;
};

export type BookingSeriesRow = {
  bucket: string;
  requests: number;
  approvals: number;
  declines: number;
  cancellations: number;
  deposits_requested: number;
  deposits_paid: number;
};

export type DepositTotalsRow = {
  currency: string;
  paid_count: number;
  paid_sum: number | string;
};

export type AuthSummaryRow = {
  total_users: number;
  confirmed_users: number;
  users_without_profile: number;
  first_user_at: string | null;
  last_user_at: string | null;
};

export type LifecycleEngagementRow = {
  definition_key: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export type ActivityKindRow = {
  kind: string;
  occurrences: number;
  artists: number;
};

export type DecisionLatencyRow = {
  booking_id: string;
  created_at: string;
  first_decision_at: string;
};

/** Retention states derived from last meaningful activity. Definitions in
 *  docs/metric-definitions.md; thresholds configurable in growth settings. */
export type RetentionState =
  | "active"
  | "churn_risk"
  | "dormant"
  | "churned"
  | "pre_activation";

/** Funnel/segment stages the User explorer can filter by. */
export type ExplorerStage =
  | "all"
  | "claimed_not_completed"
  | "completed_no_requests"
  | "requests_no_approval"
  | "activated"
  | "activated_inactive";

export type MetricComparison = {
  current: number;
  previous: number | null;
  /** Percentage change vs previous, null when previous is 0/unknown. */
  deltaPct: number | null;
};

export type Insight = {
  id: string;
  severity: "info" | "watch" | "attention";
  title: string;
  body: string;
  currentValue: string;
  comparisonValue: string | null;
  period: string;
  segment: string | null;
  /** Present when the underlying sample is below the configured minimum. */
  sampleWarning: string | null;
  suggestion: string;
  href: string;
};
