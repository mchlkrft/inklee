/**
 * Shared test fixtures for the pure growth modules. makeRow returns a counted
 * artist (real, active, not soft-deleted) with zero activity and no booking
 * signals; each test overrides only what it needs.
 */

import type { ActivityDayRow, ArtistStatsRow } from "../types";

export function makeRow(
  overrides: Partial<ArtistStatsRow> = {},
): ArtistStatsRow {
  return {
    id: "artist-1",
    slug: "artist-1",
    display_name: "Artist One",
    is_tester: false,
    account_status: "active",
    soft_deleted: false,
    booking_mode: "requests",
    timezone: "Europe/Berlin",
    account_created_at: "2026-05-01T10:00:00Z",
    profile_claimed_at: "2026-05-01T10:05:00Z",
    last_sign_in_at: null,
    email_confirmed: true,
    onboarding_completed: false,
    ever_completed_onboarding: false,
    books_configured: false,
    books_open_flag: false,
    booking_window_ends_at: null,
    form_configured: false,
    profile_info_set: false,
    stripe_account_status: null,
    attribution_source: null,
    attribution_medium: null,
    attribution_campaign: null,
    attribution_referrer: null,
    attribution_entry_path: null,
    attribution_platform: null,
    total_requests: 0,
    pending_requests: 0,
    approved_requests: 0,
    rejected_requests: 0,
    cancelled_requests: 0,
    artist_created_requests: 0,
    first_request_at: null,
    last_request_at: null,
    deposits_requested: 0,
    deposits_paid: 0,
    first_deposit_paid_at: null,
    first_approved_at: null,
    last_decision_at: null,
    slot_count: 0,
    first_slot_created_at: null,
    trip_count: 0,
    published_trip_count: 0,
    first_trip_at: null,
    flash_count: 0,
    published_flash_count: 0,
    first_flash_at: null,
    waitlist_count: 0,
    custom_field_count: 0,
    email_template_count: 0,
    instagram_connected: false,
    device_platforms: null,
    last_mobile_seen_at: null,
    first_device_at: null,
    support_ticket_count: 0,
    onboarding_completed_event_at: null,
    link_copied_count: 0,
    lifecycle_sends: 0,
    last_lifecycle_send_at: null,
    last_activity_at: null,
    last_presence_day: null,
    presence_days_90: null,
    ...overrides,
  };
}

/** Activated per the v1 definition: onboarding done, page live, one booking
 *  signal (a slot). Override the signal fields to exercise other branches. */
export function makeActivatedRow(
  overrides: Partial<ArtistStatsRow> = {},
): ArtistStatsRow {
  return makeRow({ onboarding_completed: true, slot_count: 1, ...overrides });
}

export function makeActivityDay(
  artist_id: string,
  day: string,
  overrides: Partial<ActivityDayRow> = {},
): ActivityDayRow {
  return { artist_id, day, actions: 1, presence: true, ...overrides };
}
