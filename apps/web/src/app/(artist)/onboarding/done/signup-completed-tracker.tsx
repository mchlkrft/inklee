"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/track";

// Module-level guard: the server only renders this component on the genuine
// completion transition (settings.signup_event_fired gate), so this exists
// purely to stop React StrictMode's dev double-effect from double-firing.
let firedThisPageload = false;

/**
 * Fires the once-per-account `signup_completed` conversion event from the
 * browser, where the stored first-touch attribution (original marketing entry
 * page, source, medium, campaign) is available. The server decides WHETHER
 * this component renders (exactly once per account, internal users excluded);
 * this component just sends.
 */
export default function SignupCompletedTracker() {
  useEffect(() => {
    if (firedThisPageload) return;
    firedThisPageload = true;
    trackEvent("signup_completed", { platform: "web" });
  }, []);

  return null;
}
