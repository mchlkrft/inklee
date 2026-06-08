// PII-safe product analytics. `track` is the single call site for events; today
// it's a dev-logging no-op, ready to POST to an events endpoint when one exists.
// Per the mobile plan, events carry NO client or tattoo PII — event names plus
// coarse, non-identifying props (counts, booleans, enum-ish strings) only.

export type AnalyticsEvent =
  | "screen_view"
  | "sign_in"
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
  // TODO: POST to a mobile analytics-events endpoint once it exists.
}

/** Hook form for screens/components, matching the rest of the app's lib hooks. */
export function useAnalytics() {
  return { track };
}
