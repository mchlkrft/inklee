/**
 * Client-side public analytics collector. First-party, cookie-free,
 * non-blocking; sends registry-validated events to /api/wa/collect on the
 * SAME origin (every Inklee hostname serves this app, so booking subdomains
 * post same-origin too).
 *
 * What it never does: read form values, page titles or DOM text; set cookies;
 * run in development or preview builds; send anything for browsers marked
 * internal (?internal=1, the same marker the Plausible events respect).
 */

import type { PublicEventName } from "./event-registry";
import { PUBLIC_EVENTS } from "./event-registry";

const INTERNAL_KEY = "inklee_internal";
const SESSION_CONTEXT_KEY = "inklee_wa_session";

/** Authed/product prefixes the collector must never track. */
const PRIVATE_PREFIXES = [
  "/dashboard",
  "/bookings",
  "/settings",
  "/admin",
  "/onboarding",
  "/calendar",
  "/clients",
  "/flash",
  "/travel",
  "/goods",
  "/analytics",
  "/link-hub",
  "/support",
  "/notifications",
  "/auth",
  "/api",
  "/request", // tokened customer portal
  "/reset-password",
  "/unsubscribe",
  "/instagram",
  "/map",
  "/dev",
];

/** Artist subdomains (mikey.inkl.ee) and hub subdomains serve only public
 *  pages: authed cookies cannot flow to *.inkl.ee (see proxy.ts), so the
 *  main-host private-prefix list does not apply there. */
function isPublicSubdomain(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host !== "inkl.ee" && host.endsWith(".inkl.ee");
}

export function isTrackablePath(pathname: string, hostname?: string): boolean {
  if (hostname && isPublicSubdomain(hostname)) return true;
  return !PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function enabled(): boolean {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV !== "production") return false;
  if (
    process.env.NEXT_PUBLIC_VERCEL_ENV &&
    process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"
  ) {
    return false;
  }
  try {
    if (window.localStorage.getItem(INTERNAL_KEY) === "1") return false;
  } catch {
    // storage blocked: keep tracking (no identity involved)
  }
  return true;
}

function normalizePath(pathname: string): string {
  let path = pathname.split("?")[0].split("#")[0];
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

export type SessionAcquisitionContext = {
  landingPath: string;
  referrerDomain?: string;
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
};

/** Same-session acquisition context (sessionStorage: cleared when the tab
 *  closes; used for the pageview landing hint and last-touch attribution). */
export function getSessionContext(): SessionAcquisitionContext | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_CONTEXT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionAcquisitionContext;
    return typeof parsed.landingPath === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** Content filter matching the server's cleanUtm: clamp, drop empty and
 *  values shaped like an email or a URL (campaign labels never need them). */
function cleanLabel(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const clamped = value.trim().slice(0, 150);
  if (!clamped || clamped.includes("@") || clamped.includes("://"))
    return undefined;
  return clamped;
}

function captureSessionContext(pathname: string): void {
  try {
    if (window.sessionStorage.getItem(SESSION_CONTEXT_KEY)) return;
    const params = new URLSearchParams(window.location.search);
    const clean = cleanLabel;
    const context: SessionAcquisitionContext = { landingPath: pathname };
    try {
      if (document.referrer) {
        const ref = new URL(document.referrer);
        if (ref.origin !== window.location.origin)
          context.referrerDomain = ref.hostname;
      }
    } catch {
      // unparsable referrer
    }
    context.source = clean(params.get("utm_source"));
    context.medium = clean(params.get("utm_medium"));
    context.campaign = clean(params.get("utm_campaign"));
    context.content = clean(params.get("utm_content"));
    context.term = clean(params.get("utm_term"));
    window.sessionStorage.setItem(SESSION_CONTEXT_KEY, JSON.stringify(context));
  } catch {
    // sessionStorage blocked: degrade to per-event UTM only
  }
}

function screenBucket(): string {
  const width = window.innerWidth;
  if (width < 480) return "xs";
  if (width < 768) return "sm";
  if (width < 1024) return "md";
  if (width < 1440) return "lg";
  return "xl";
}

function send(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/wa/collect",
        new Blob([body], { type: "application/json" }),
      );
    } else {
      void fetch("/api/wa/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => undefined);
    }
  } catch {
    // analytics must never break the page
  }
}

function basePayload(pathname: string): Record<string, unknown> {
  const params = new URLSearchParams(window.location.search);
  const session = getSessionContext();
  // Content-filter the live-URL values too (session values are already
  // filtered at capture time), so an email-shaped UTM never leaves the browser.
  return {
    occurredAt: new Date().toISOString(),
    hostname: window.location.hostname,
    pathname,
    landingPath: session?.landingPath,
    referrerDomain: session?.referrerDomain ?? safeReferrerDomain(),
    utmSource: cleanLabel(params.get("utm_source")) ?? session?.source,
    utmMedium: cleanLabel(params.get("utm_medium")) ?? session?.medium,
    utmCampaign: cleanLabel(params.get("utm_campaign")) ?? session?.campaign,
    utmContent: cleanLabel(params.get("utm_content")) ?? session?.content,
    utmTerm: cleanLabel(params.get("utm_term")) ?? session?.term,
    screenBucket: screenBucket(),
  };
}

function safeReferrerDomain(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const ref = new URL(document.referrer);
    return ref.origin === window.location.origin ? undefined : ref.hostname;
  } catch {
    return undefined;
  }
}

let lastPageviewPath: string | null = null;

/** One pageview per real navigation; duplicate route events are dropped. */
export function trackPublicPageview(rawPathname: string): void {
  if (!enabled()) return;
  const pathname = normalizePath(rawPathname);
  if (!isTrackablePath(pathname, window.location.hostname)) return;
  if (pathname === lastPageviewPath) return;
  lastPageviewPath = pathname;
  captureSessionContext(pathname);
  send({ ...basePayload(pathname), eventName: "pageview" });
}

/**
 * Typed public event API. Only catalogued names with allowlisted props;
 * anything else is a no-op (the server validates again).
 */
export function trackPublicEvent(
  eventName: PublicEventName,
  props?: Record<string, string>,
): void {
  if (!enabled()) return;
  if (!Object.prototype.hasOwnProperty.call(PUBLIC_EVENTS, eventName)) return;
  const pathname = normalizePath(window.location.pathname);
  if (!isTrackablePath(pathname, window.location.hostname)) return;
  captureSessionContext(pathname);
  send({ ...basePayload(pathname), eventName, props });
}
