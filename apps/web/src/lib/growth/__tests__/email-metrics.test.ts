import { describe, expect, it } from "vitest";
import {
  associateLifecycleConversions,
  type LifecycleMarker,
} from "../email-metrics";
import type { ArtistStatsRow } from "../types";

function statsRow(overrides: Partial<ArtistStatsRow> = {}): ArtistStatsRow {
  return {
    id: "artist-1",
    slug: "artist-1",
    display_name: "Artist One",
    is_tester: false,
    account_status: "active",
    soft_deleted: false,
    booking_mode: "requests",
    timezone: "Europe/Berlin",
    account_created_at: "2026-06-01T00:00:00.000Z",
    profile_claimed_at: "2026-06-01T00:00:00.000Z",
    last_sign_in_at: null,
    email_confirmed: true,
    onboarding_completed: true,
    ever_completed_onboarding: true,
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

function marker(overrides: Partial<LifecycleMarker> = {}): LifecycleMarker {
  return {
    definition_key: "books_open_live",
    artist_id: "artist-1",
    status: "sent",
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

function stats(rows: ArtistStatsRow[]): Map<string, ArtistStatsRow> {
  return new Map(rows.map((row) => [row.id, row]));
}

describe("associateLifecycleConversions", () => {
  it("returns an empty array for no markers", () => {
    expect(associateLifecycleConversions([], stats([]), 7)).toEqual([]);
  });

  it("does not count an outcome that predates the send", () => {
    const result = associateLifecycleConversions(
      [marker({ created_at: "2026-07-10T00:00:00.000Z" })],
      stats([statsRow({ first_request_at: "2026-07-01T00:00:00.000Z" })]),
      7,
    );
    expect(result).toEqual([
      {
        definitionKey: "books_open_live",
        outcomeLabel: "First request received",
        sent: 1,
        convertedWithinWindow: 0,
        conversionPct: 0,
      },
    ]);
  });

  it("counts an outcome inside the attribution window", () => {
    const result = associateLifecycleConversions(
      [marker()],
      stats([statsRow({ first_request_at: "2026-07-03T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].convertedWithinWindow).toBe(1);
    expect(result[0].conversionPct).toBe(100);
  });

  it("counts an outcome at exactly the send timestamp", () => {
    const result = associateLifecycleConversions(
      [marker()],
      stats([statsRow({ first_request_at: "2026-07-01T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].convertedWithinWindow).toBe(1);
  });

  it("counts an outcome at exactly the window boundary and not one past it", () => {
    const atBoundary = associateLifecycleConversions(
      [marker()],
      stats([statsRow({ first_request_at: "2026-07-08T00:00:00.000Z" })]),
      7,
    );
    expect(atBoundary[0].convertedWithinWindow).toBe(1);

    const pastBoundary = associateLifecycleConversions(
      [marker()],
      stats([statsRow({ first_request_at: "2026-07-08T00:00:00.001Z" })]),
      7,
    );
    expect(pastBoundary[0].convertedWithinWindow).toBe(0);
  });

  it("does not count an outcome outside the window", () => {
    const result = associateLifecycleConversions(
      [marker()],
      stats([statsRow({ first_request_at: "2026-07-11T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].convertedWithinWindow).toBe(0);
    expect(result[0].conversionPct).toBe(0);
  });

  it("skips sends whose artist is unknown but still counts them as sent", () => {
    const result = associateLifecycleConversions(
      [marker({ artist_id: "artist-1" }), marker({ artist_id: "ghost" })],
      stats([statsRow({ first_request_at: "2026-07-02T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].sent).toBe(2);
    expect(result[0].convertedWithinWindow).toBe(1);
    expect(result[0].conversionPct).toBe(50);
  });

  it("skips non-sent markers and markers without an artist entirely", () => {
    const result = associateLifecycleConversions(
      [
        marker({ status: "opened" }),
        marker({ status: "failed" }),
        marker({ artist_id: null }),
      ],
      stats([statsRow({ first_request_at: "2026-07-02T00:00:00.000Z" })]),
      7,
    );
    expect(result).toEqual([]);
  });

  it("uses the deposit-or-approval target for first_booking_approved", () => {
    const result = associateLifecycleConversions(
      [marker({ definition_key: "first_booking_approved" })],
      stats([statsRow({ first_deposit_paid_at: "2026-07-02T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].outcomeLabel).toBe("Deposit or next approval activity");
    expect(result[0].convertedWithinWindow).toBe(1);
  });

  it("falls back to decision-era approval data when first_approved_at is missing", () => {
    // firstApprovalAt falls back to last_decision_at for rows that predate
    // the status_changed audit trail.
    const result = associateLifecycleConversions(
      [marker({ definition_key: "first_booking_approved" })],
      stats([
        statsRow({
          approved_requests: 1,
          last_decision_at: "2026-07-02T00:00:00.000Z",
        }),
      ]),
      7,
    );
    expect(result[0].convertedWithinWindow).toBe(1);
  });

  it("uses the fallback outcome and label for unknown definition keys", () => {
    // Fallback chain is first_request_at, then approval, then deposit; this
    // row only has a deposit.
    const result = associateLifecycleConversions(
      [marker({ definition_key: "custom_experiment" })],
      stats([statsRow({ first_deposit_paid_at: "2026-07-02T00:00:00.000Z" })]),
      7,
    );
    expect(result[0].outcomeLabel).toBe("Any meaningful outcome");
    expect(result[0].convertedWithinWindow).toBe(1);
  });

  it("does not convert an artist with no outcome at all", () => {
    const result = associateLifecycleConversions(
      [marker()],
      stats([statsRow()]),
      7,
    );
    expect(result[0].convertedWithinWindow).toBe(0);
  });

  it("rounds conversionPct to the nearest integer", () => {
    const result = associateLifecycleConversions(
      [
        marker({ artist_id: "a" }),
        marker({ artist_id: "b" }),
        marker({ artist_id: "c" }),
      ],
      stats([
        statsRow({ id: "a", first_request_at: "2026-07-02T00:00:00.000Z" }),
        statsRow({ id: "b", first_request_at: "2026-08-01T00:00:00.000Z" }),
        statsRow({ id: "c" }),
      ]),
      7,
    );
    expect(result[0].sent).toBe(3);
    expect(result[0].convertedWithinWindow).toBe(1);
    expect(result[0].conversionPct).toBe(33);
  });

  it("sorts summaries by definition key regardless of marker order", () => {
    const result = associateLifecycleConversions(
      [
        marker({ definition_key: "z_def" }),
        marker({ definition_key: "a_def" }),
        marker({ definition_key: "m_def" }),
      ],
      stats([statsRow()]),
      7,
    );
    expect(result.map((summary) => summary.definitionKey)).toEqual([
      "a_def",
      "m_def",
      "z_def",
    ]);
  });
});
