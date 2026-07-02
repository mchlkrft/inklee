/**
 * Client-side Plausible custom-event helper (browser only; callers are client
 * components). Plausible is the only analytics platform: cookie-free, no
 * fingerprinting, no advertising scripts.
 *
 * Privacy rules (docs/seo/conversion-measurement.md):
 * - Props are paths, hosts, campaign labels, and stable identifiers only.
 *   Never emails, names, Instagram handles, booking or client data.
 * - First-touch attribution lives in localStorage (NOT a cookie, preserving
 *   the documented cookie-free position) and stores the entry pathname, the
 *   external referrer's origin, and utm_source/medium/campaign.
 * - Internal browsers (marked once via ?internal=1) send nothing at all.
 */

import type { AttributionProps } from "@/lib/analytics-gates";

const ATTRIBUTION_KEY = "inklee_attribution";
const INTERNAL_KEY = "inklee_internal";

type PlausibleFn = (
  event: string,
  options?: { props?: Record<string, string> },
) => void;

declare global {
  interface Window {
    plausible?: PlausibleFn & { q?: unknown[] };
  }
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // storage blocked — tracking degrades to no attribution
  }
}

/** True when this browser was marked internal via ?internal=1. */
export function isInternalBrowser(): boolean {
  return storage()?.getItem(INTERNAL_KEY) === "1";
}

/**
 * `?internal=1` marks this browser internal (no conversion events ever sent);
 * `?internal=0` clears the mark. Run once per pageload by AnalyticsBootstrap.
 */
export function handleInternalQueryFlag(): void {
  const flag = new URLSearchParams(window.location.search).get("internal");
  if (flag === "1") storage()?.setItem(INTERNAL_KEY, "1");
  else if (flag === "0") storage()?.removeItem(INTERNAL_KEY);
}

/**
 * Capture first-touch attribution exactly once per browser. Later internal
 * navigation never overwrites the original entry.
 */
export function captureFirstTouchAttribution(): void {
  const store = storage();
  if (!store || store.getItem(ATTRIBUTION_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  const attribution: AttributionProps = {
    entry_path: window.location.pathname,
  };

  // External referrer only, reduced to its origin (a full referrer URL could
  // carry another site's query strings).
  try {
    if (document.referrer) {
      const ref = new URL(document.referrer);
      if (ref.origin !== window.location.origin) {
        attribution.referrer = ref.origin;
      }
    }
  } catch {
    // unparsable referrer — skip
  }

  const source = params.get("utm_source");
  const medium = params.get("utm_medium");
  const campaign = params.get("utm_campaign");
  if (source) attribution.source = source.slice(0, 200);
  if (medium) attribution.medium = medium.slice(0, 200);
  if (campaign) attribution.campaign = campaign.slice(0, 200);

  try {
    store.setItem(ATTRIBUTION_KEY, JSON.stringify(attribution));
  } catch {
    // quota exceeded — harmless
  }
}

/** Stored first-touch attribution, prop-ready (empty when never captured). */
export function getStoredAttribution(): AttributionProps {
  try {
    const raw = storage()?.getItem(ATTRIBUTION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const props: AttributionProps = {};
    for (const key of [
      "entry_path",
      "referrer",
      "source",
      "medium",
      "campaign",
    ] as const) {
      const value = parsed[key];
      if (typeof value === "string" && value) props[key] = value.slice(0, 200);
    }
    return props;
  } catch {
    return {};
  }
}

/**
 * Send a Plausible custom event. No-ops for internal browsers and outside the
 * browser. Automatically merges first-touch attribution and the current path;
 * device/geo come from Plausible's own script (no custom prop needed).
 */
export function trackEvent(
  event: string,
  props: Record<string, string> = {},
): void {
  if (typeof window === "undefined") return;
  if (isInternalBrowser()) return;

  // Queue shim: events fired before the deferred Plausible script loads are
  // replayed by the script once it initialises (standard Plausible snippet).
  if (!window.plausible) {
    const queued: PlausibleFn & { q?: unknown[] } = (...args) => {
      (queued.q = queued.q ?? []).push(args);
    };
    window.plausible = queued;
  }

  try {
    window.plausible(event, {
      props: {
        ...getStoredAttribution(),
        current_path: window.location.pathname,
        ...props,
      },
    });
  } catch {
    // analytics must never break the product
  }
}
