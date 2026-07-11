import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/get-client-ip";
import { checkAnalyticsIngestRateLimit } from "@/lib/ratelimit";
import { classifyChannel } from "@/lib/public-analytics/channels";
import {
  cleanCountryCode,
  cleanUtm,
  isAllowedHostname,
  isBotUserAgent,
  isValidScreenBucket,
  normalizePathname,
  parseUserAgent,
  referrerDomainOf,
  visitorDayHash,
} from "@/lib/public-analytics/enrich";
import {
  isClientEmittable,
  isConversionEvent,
  validatePublicEvent,
} from "@/lib/public-analytics/event-registry";

export const runtime = "nodejs";

// POST /api/wa/collect — first-party public analytics ingestion.
//
// Privacy invariants (docs/public-analytics.md):
// - The client IP is read transiently to build the daily visitor HMAC and for
//   optional CIDR exclusion; it is never stored and never logged.
// - The user agent is reduced to coarse families; the raw string is dropped.
// - Only registry-validated events with allowlisted properties are stored.
// - Rejections increment per-day counters (counts only, no request data).
//
// Analytics must never break the public site: every failure path returns 202.

const MAX_BODY_BYTES = 4_096;

function bumpStat(field: string): void {
  const day = new Date().toISOString().slice(0, 10);
  void serviceClient
    .rpc("wa_ingest_bump", { p_day: day, p_field: field })
    .then(({ error }) => {
      if (error) console.error("[wa] stat bump failed", error.message);
    });
}

function accepted(): NextResponse {
  // 202 for every outcome: callers get no oracle for probing the filters.
  return new NextResponse(null, { status: 202 });
}

/** Optional env-configured exclusion (comma-separated IPs or CIDR /8 /16 /24
 *  prefixes). Matched transiently; addresses are never stored. */
function isExcludedIp(ip: string): boolean {
  const raw = process.env.WA_EXCLUDE_IPS;
  if (!raw || ip === "unknown") return false;
  for (const entry of raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    if (entry.includes("/")) {
      const [base, bitsRaw] = entry.split("/");
      const bits = parseInt(bitsRaw, 10);
      const octets = bits === 8 ? 1 : bits === 16 ? 2 : bits === 24 ? 3 : null;
      if (octets) {
        const prefix = base.split(".").slice(0, octets).join(".");
        if (ip.startsWith(`${prefix}.`) || ip === base) return true;
      }
    } else if (entry === ip) {
      return true;
    }
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const secret = process.env.WA_VISITOR_HASH_SECRET;
    // Fail CLOSED: collection runs only in the production Vercel environment
    // with the secret configured. Local machines that happen to hold the
    // mirrored prod env (including this repo's .env.local) never write rows.
    if (!secret) return accepted();
    if (process.env.VERCEL_ENV !== "production") return accepted();

    const headerStore = await headers();
    const userAgent = headerStore.get("user-agent");
    if (isBotUserAgent(userAgent)) {
      bumpStat("bot_rejected");
      return accepted();
    }
    // The explicit internal marker (set by the admin exclusion control; the
    // client also self-suppresses via localStorage, this is the server-side
    // backstop, checked as both a header and the mirrored cookie).
    if (
      headerStore.get("x-inklee-internal") === "1" ||
      /(^|;\s*)inklee_internal=1(;|$)/.test(headerStore.get("cookie") ?? "")
    ) {
      bumpStat("internal_rejected");
      return accepted();
    }

    const ip = getClientIp(headerStore);
    if (isExcludedIp(ip)) {
      bumpStat("internal_rejected");
      return accepted();
    }

    // Per-IP ceiling (generous: real multi-tab browsing is unaffected). The
    // raw IP is used transiently for the key and never stored.
    const { allowed } = await checkAnalyticsIngestRateLimit(ip);
    if (!allowed) return accepted();

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      bumpStat("invalid_payload");
      return accepted();
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      bumpStat("invalid_payload");
      return accepted();
    }

    const hostname =
      typeof body.hostname === "string"
        ? body.hostname.toLowerCase().slice(0, 120)
        : "";
    if (!isAllowedHostname(hostname) || hostname === "localhost") {
      bumpStat("unsupported_hostname");
      return accepted();
    }

    const validated = validatePublicEvent(
      typeof body.eventName === "string" ? body.eventName : "",
      body.props,
    );
    const pathname = normalizePathname(
      typeof body.pathname === "string" ? body.pathname : "",
    );
    // Server-truth conversions (signup/booking completed, beta invite) are
    // recorded server-side only; a client must not be able to forge them.
    if (!validated || !pathname || !isClientEmittable(validated.event)) {
      bumpStat("invalid_payload");
      return accepted();
    }

    // Timestamps: client clock within tolerance, else server time.
    let occurredAt = new Date();
    if (typeof body.occurredAt === "string") {
      const parsed = new Date(body.occurredAt);
      const skew = Date.now() - parsed.getTime();
      if (
        !Number.isNaN(parsed.getTime()) &&
        skew > -120_000 &&
        skew < 600_000
      ) {
        occurredAt = parsed;
      }
    }

    const families = parseUserAgent(userAgent ?? "");
    const hash = visitorDayHash({
      secret,
      dateKey: new Date().toISOString().slice(0, 10),
      hostname,
      ip,
      uaSignal: families.stabilitySignal,
    });

    // Duplicate pageviews are prevented at the source: the client collector
    // fires one pageview per real route change (lastPageviewPath) and only in
    // production. No server-side de-dup window is needed, and a per-instance
    // one would drop legitimate repeat pageviews across serverless instances.

    const utm = cleanUtm(body);
    const referrerDomain = referrerDomainOf(
      typeof body.referrerDomain === "string" ? body.referrerDomain : null,
    );
    const channel = classifyChannel({
      utmSource: utm.source ?? null,
      utmMedium: utm.medium ?? null,
      referrerDomain,
    });

    const { error } = await serviceClient.from("web_analytics_events").insert({
      occurred_at: occurredAt.toISOString(),
      event_name: validated.event,
      hostname,
      pathname,
      landing_path: normalizePathname(
        typeof body.landingPath === "string" ? body.landingPath : "",
      ),
      referrer_domain: referrerDomain,
      channel,
      utm_source: utm.source ?? null,
      utm_medium: utm.medium ?? null,
      utm_campaign: utm.campaign ?? null,
      utm_content: utm.content ?? null,
      utm_term: utm.term ?? null,
      country_code: cleanCountryCode(headerStore.get("x-vercel-ip-country")),
      device_type: families.deviceType,
      browser_family: families.browserFamily,
      os_family: families.osFamily,
      screen_bucket: isValidScreenBucket(body.screenBucket)
        ? body.screenBucket
        : null,
      visitor_day_hash: hash,
      is_conversion: isConversionEvent(validated.event),
      properties: validated.props,
    });
    if (error) console.error("[wa] insert failed", error.message);

    return accepted();
  } catch (err) {
    console.error("[wa] collect crashed", err);
    return accepted();
  }
}
