"use client";

import { useEffect } from "react";
import {
  captureFirstTouchAttribution,
  handleInternalQueryFlag,
} from "@/lib/track";

/**
 * Mounted once in the root layout. On first paint it (1) processes the
 * ?internal=1 / ?internal=0 marker that flags a browser as internal (internal
 * browsers never send conversion events) and (2) captures first-touch
 * marketing attribution into localStorage exactly once per browser, so later
 * internal navigation never overwrites the original entry page.
 */
export default function AnalyticsBootstrap() {
  useEffect(() => {
    handleInternalQueryFlag();
    captureFirstTouchAttribution();
  }, []);

  return null;
}
