"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  isTrackablePath,
  trackPublicEvent,
  trackPublicPageview,
} from "@/lib/public-analytics/collector";
import { isBookingPagePath } from "@/lib/public-analytics/booking-paths";

/**
 * Mounts the first-party public analytics collector. usePathname changes on
 * real client-side navigations only (prefetches and server renders never run
 * this effect), and the collector itself dedupes repeat fires for the same
 * path, so the initial render counts exactly once.
 */
export default function PublicAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    trackPublicPageview(pathname);
    if (
      isBookingPagePath(pathname, window.location.hostname) &&
      isTrackablePath(pathname, window.location.hostname)
    ) {
      trackPublicEvent("booking_page_viewed");
    }
  }, [pathname]);

  return null;
}
