// PII-safe product analytics. `track` is the single call site for events; today
// it's a dev-logging no-op, ready to POST to an events endpoint when one exists.
// Per the mobile plan, events carry NO client or tattoo PII — event names plus
// coarse, non-identifying props (counts, booleans, enum-ish strings) only.

import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { apiPost } from "./api";

export type AnalyticsEvent =
  | "screen_view"
  | "sign_in"
  | "sign_up"
  | "onboarding_completed"
  | "booking_accepted"
  | "booking_rejected"
  | "booking_cancelled"
  | "deposit_requested"
  | "deposit_marked_received"
  | "deposit_refunded";

type AnalyticsProps = Record<string, string | number | boolean>;

export function track(event: AnalyticsEvent, props?: AnalyticsProps) {
  if (__DEV__) {
    console.log("[analytics]", event, props ?? {});
  }
  // Deliberately a no-op: this vocabulary (booking accept/pass, deposit_*,
  // onboarding_completed, sign_up) is ALREADY captured server-side by the
  // shared mobile API cores (audit_log status changes, the onboarding-complete
  // route, artist_signup_completed) and appears in the growth cockpit's
  // growth_activity_events. POSTing it too would double-count. screen_view is
  // the only net-new signal and passive navigation is intentionally not treated
  // as meaningful activity. The one legitimate mobile growth signal that is NOT
  // duplicated is booking_link_copied (below).
}

/**
 * Report that the artist copied their public booking link from the app. This
 * is the ONE mobile growth event that canonical server data cannot see (the
 * "link shared" step between page-live and first-request). Goes to the growth
 * analytics_events store via /api/mobile/events (catalogued + rate-limited +
 * tester/admin-excluded server-side). Fire-and-forget: never blocks or throws.
 */
export function reportBookingLinkCopied() {
  void apiPost("/events", {
    events: [{ event: "booking_link_copied", props: { surface: "mobile_app" } }],
  }).catch(() => undefined);
}

/** Fire a `screen_view` each time a screen gains focus (expo-router). `screen`
 *  is a coarse, non-identifying name — never a slug/email/id. */
export function useScreenView(screen: string) {
  useFocusEffect(
    useCallback(() => {
      track("screen_view", { screen });
    }, [screen]),
  );
}
