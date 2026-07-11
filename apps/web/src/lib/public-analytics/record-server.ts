/**
 * Server-side public event recorder for conversions whose truth lives in a
 * server action or route (signup completed, booking request completed,
 * waitlist joined). Computes the same daily visitor hash as the ingestion
 * route from the request headers, so server-emitted conversions join the
 * visitor's client-side visit. Fire-and-forget: never throws, never blocks.
 */

import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/get-client-ip";
import { classifyChannel } from "@/lib/public-analytics/channels";
import {
  cleanCountryCode,
  isAllowedHostname,
  isBotUserAgent,
  normalizePathname,
  parseUserAgent,
  referrerDomainOf,
  visitorDayHash,
} from "@/lib/public-analytics/enrich";
import {
  isConversionEvent,
  validatePublicEvent,
  type PublicEventName,
} from "@/lib/public-analytics/event-registry";

export type PublicServerEventInput = {
  /** Incoming request headers (host, UA, IP, country). Read transiently. */
  headers: Headers;
  /** Path the event is attributed to, e.g. "/signup". */
  pathname: string;
  props?: Record<string, string>;
  /** Session acquisition hints when the caller carried them (hidden fields). */
  landingPath?: string | null;
  referrerDomain?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

export async function recordPublicServerEvent(
  eventName: PublicEventName,
  input: PublicServerEventInput,
): Promise<void> {
  try {
    const secret = process.env.WA_VISITOR_HASH_SECRET;
    if (!secret) return;
    if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production")
      return;

    const validated = validatePublicEvent(eventName, input.props);
    if (!validated) return;

    const headerStore = input.headers;
    const userAgent = headerStore.get("user-agent");
    if (isBotUserAgent(userAgent)) return;
    if (headerStore.get("x-inklee-internal") === "1") return;
    // The admin exclusion control mirrors its marker into an inklee_internal
    // cookie so server-recorded conversions skip excluded browsers too.
    if (
      /(^|;\s*)inklee_internal=1(;|$)/.test(headerStore.get("cookie") ?? "")
    ) {
      return;
    }

    const hostname = (headerStore.get("host") ?? "inklee.app")
      .toLowerCase()
      .split(":")[0];
    if (!isAllowedHostname(hostname)) return;

    const pathname = normalizePathname(input.pathname);
    if (!pathname) return;

    const families = parseUserAgent(userAgent ?? "");
    const hash = visitorDayHash({
      secret,
      dateKey: new Date().toISOString().slice(0, 10),
      hostname,
      ip: getClientIp(headerStore),
      uaSignal: families.stabilitySignal,
    });

    const referrerDomain = referrerDomainOf(input.referrerDomain);
    const { error } = await serviceClient.from("web_analytics_events").insert({
      occurred_at: new Date().toISOString(),
      event_name: validated.event,
      hostname,
      pathname,
      landing_path: input.landingPath
        ? normalizePathname(input.landingPath)
        : null,
      referrer_domain: referrerDomain,
      channel: classifyChannel({
        utmSource: input.utmSource ?? null,
        utmMedium: input.utmMedium ?? null,
        referrerDomain,
      }),
      utm_source: input.utmSource ?? null,
      utm_medium: input.utmMedium ?? null,
      utm_campaign: input.utmCampaign ?? null,
      country_code: cleanCountryCode(headerStore.get("x-vercel-ip-country")),
      device_type: families.deviceType,
      browser_family: families.browserFamily,
      os_family: families.osFamily,
      visitor_day_hash: hash,
      is_conversion: isConversionEvent(validated.event),
      properties: validated.props,
    });
    if (error)
      console.error(`[wa] server event ${eventName} failed`, error.message);
  } catch (err) {
    console.error("[wa] recordPublicServerEvent crashed", err);
  }
}
