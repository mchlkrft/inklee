import { ApiError } from "./api";

// Plan-boundary errors, displayed IAP-safe (P0 of the Plus build).
//
// The server's cap and entitlement messages are written for the WEB, where
// "Upgrade to Plus" is fine. Inside the app that sentence is a steering
// problem (D17: no purchase direction in the app), and `not_entitled` arrives
// as a raw server string with no handling at all. Route every plan-boundary
// catch through this helper: it keeps the informative half of the server
// message (the actual limit) and drops purchase steering entirely.

const STEERING_SENTENCE = /\s*Upgrade to Plus[^.]*\.\s*$/;

export function planBoundaryMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === "cap_reached") {
      const kept = e.message.replace(STEERING_SENTENCE, "").trim();
      return kept.length > 0
        ? kept
        : "You've reached your current plan's limit for this.";
    }
    if (e.code === "not_entitled") {
      return "This isn't included in your current plan.";
    }
  }
  return e instanceof Error ? e.message : fallback;
}
