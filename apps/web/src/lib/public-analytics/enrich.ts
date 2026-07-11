/**
 * Server-side enrichment + filtering for public web analytics ingestion.
 * Pure functions (unit-tested); the ingestion route composes them.
 *
 * Privacy invariants enforced here:
 * - The raw IP exists only transiently inside visitorDayHash(); it is never
 *   returned, stored, or logged.
 * - The full user agent is reduced to coarse families and a stability signal;
 *   the raw string is never stored.
 * - Referrers are reduced to their registrable domain part (no paths/queries).
 */

import { createHmac } from "node:crypto";

export const ALLOWED_HOSTNAME_SUFFIXES = [
  "inklee.app",
  "inkl.ee", // apex + artist subdomains + *.l.inkl.ee hub pages
] as const;

export function isAllowedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return ALLOWED_HOSTNAME_SUFFIXES.some(
    (suffix) => lower === suffix || lower.endsWith(`.${suffix}`),
  );
}

/** Normalize a pathname: strip query/hash (defense in depth; the client
 *  already strips), collapse duplicate slashes, drop trailing slash. */
export function normalizePathname(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300)
    return null;
  let path = raw.split("?")[0].split("#")[0];
  if (!path.startsWith("/")) return null;
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path;
}

/** Reduce a referrer to its host (never paths or query strings). */
export function referrerDomainOf(
  raw: string | undefined | null,
): string | null {
  if (!raw) return null;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (!host || host.length > 120) return null;
    return host;
  } catch {
    return null;
  }
}

const BOT_UA_PATTERNS = [
  /bot\b/i,
  /crawl/i,
  /spider/i,
  /slurp/i,
  /bingpreview/i,
  /facebookexternalhit/i,
  /whatsapp/i,
  /telegrambot/i,
  /discordbot/i,
  /slackbot/i,
  /twitterbot/i,
  /linkedinbot/i,
  /pinterest/i,
  /embedly/i,
  /quora link preview/i,
  /vkshare/i,
  /w3c_validator/i,
  /lighthouse/i,
  /headlesschrome/i,
  /phantomjs/i,
  /puppeteer/i,
  /playwright/i,
  /uptime/i,
  /pingdom/i,
  /statuscake/i,
  /monitor/i,
  /curl\//i,
  /wget\//i,
  /python-requests/i,
  /go-http-client/i,
  /axios\//i,
  /vercel-screenshot/i,
  /vercelbot/i,
];

/** Conservative bot check: known crawlers, preview bots, monitors, headless
 *  automation, and missing/absurd user agents. */
export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent || userAgent.length < 20) return true;
  return BOT_UA_PATTERNS.some((pattern) => pattern.test(userAgent));
}

export type UaFamilies = {
  deviceType: "desktop" | "mobile" | "tablet";
  browserFamily: string;
  osFamily: string;
  /** Coarse signal folded into the visitor hash (NOT stored). */
  stabilitySignal: string;
};

/** Coarse UA families only; the raw string never leaves this function's caller. */
export function parseUserAgent(userAgent: string): UaFamilies {
  const ua = userAgent.toLowerCase();

  const deviceType: UaFamilies["deviceType"] = /ipad|tablet|kindle|silk/.test(
    ua,
  )
    ? "tablet"
    : /mobi|iphone|android.+mobile|windows phone/.test(ua)
      ? "mobile"
      : /android/.test(ua)
        ? "tablet"
        : "desktop";

  let browserFamily = "other";
  if (ua.includes("edg/")) browserFamily = "edge";
  else if (ua.includes("samsungbrowser")) browserFamily = "samsung";
  else if (ua.includes("opr/") || ua.includes("opera")) browserFamily = "opera";
  else if (ua.includes("firefox/")) browserFamily = "firefox";
  else if (ua.includes("chrome/") || ua.includes("crios/"))
    browserFamily = "chrome";
  else if (ua.includes("safari/") && ua.includes("version/"))
    browserFamily = "safari";

  let osFamily = "other";
  if (ua.includes("windows")) osFamily = "windows";
  else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios"))
    osFamily = "ios";
  else if (ua.includes("mac os x") || ua.includes("macintosh"))
    osFamily = "macos";
  else if (ua.includes("android")) osFamily = "android";
  else if (ua.includes("linux")) osFamily = "linux";

  return {
    deviceType,
    browserFamily,
    osFamily,
    stabilitySignal: `${browserFamily}:${osFamily}:${deviceType}`,
  };
}

/**
 * Daily anonymous visitor hash: HMAC(secret, date + hostname + ip + coarse UA
 * signal). The identifier rotates every UTC day; the raw IP is an input only
 * and is unrecoverable from the output. This is an approximate visitor
 * metric, not a person identity.
 */
export function visitorDayHash(input: {
  secret: string;
  dateKey: string; // YYYY-MM-DD (UTC)
  hostname: string;
  ip: string;
  uaSignal: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(
      `${input.dateKey}|${input.hostname.toLowerCase()}|${input.ip}|${input.uaSignal}`,
    )
    .digest("base64url")
    .slice(0, 32);
}

const UTM_KEYS = ["source", "medium", "campaign", "content", "term"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];

/** Allowlisted, clamped, content-filtered UTM values (same "@"/"://" hygiene
 *  as signup attribution: campaign labels never need them). */
export function cleanUtm(
  raw: Record<string, unknown>,
): Partial<Record<UtmKey, string>> {
  const out: Partial<Record<UtmKey, string>> = {};
  for (const key of UTM_KEYS) {
    const value = raw[`utm${key.charAt(0).toUpperCase()}${key.slice(1)}`];
    if (typeof value !== "string") continue;
    const clamped = value.trim().slice(0, 150);
    if (!clamped || clamped.includes("@") || clamped.includes("://")) continue;
    out[key] = clamped;
  }
  return out;
}

export const SCREEN_BUCKETS = ["xs", "sm", "md", "lg", "xl"] as const;

export function isValidScreenBucket(
  value: unknown,
): value is (typeof SCREEN_BUCKETS)[number] {
  return (
    typeof value === "string" &&
    (SCREEN_BUCKETS as readonly string[]).includes(value)
  );
}

/** ISO-3166 alpha-2 shape check for the edge-provided country header. */
export function cleanCountryCode(value: string | null): string | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}
