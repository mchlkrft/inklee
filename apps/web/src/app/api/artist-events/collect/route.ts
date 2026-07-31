import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { getClientIp } from "@/lib/get-client-ip";
import { checkAnalyticsIngestRateLimit } from "@/lib/ratelimit";
import { classifyChannel } from "@/lib/public-analytics/channels";
import {
  isBotUserAgent,
  isAllowedHostname,
  parseUserAgent,
  referrerDomainOf,
  visitorDayHash,
} from "@/lib/public-analytics/enrich";
import { isClientEmittableArtistEvent } from "@inklee/shared/artist-analytics";
import { resolveArtistSlug } from "@/lib/public-analytics/artist-slug-resolver";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2_048;

function accepted(): NextResponse {
  return new NextResponse(null, { status: 202 });
}

export async function POST(request: Request) {
  try {
    const secret = process.env.WA_VISITOR_HASH_SECRET;
    if (!secret) return accepted();
    if (process.env.VERCEL_ENV !== "production") return accepted();

    const headerStore = await headers();
    const userAgent = headerStore.get("user-agent");
    if (isBotUserAgent(userAgent)) return accepted();
    if (
      headerStore.get("x-inklee-internal") === "1" ||
      /(^|;\s*)inklee_internal=1(;|$)/.test(headerStore.get("cookie") ?? "")
    ) {
      return accepted();
    }

    const ip = getClientIp(headerStore);
    const { allowed } = await checkAnalyticsIngestRateLimit(ip);
    if (!allowed) return accepted();

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return accepted();

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return accepted();
    }

    const hostname =
      typeof body.hostname === "string"
        ? body.hostname.toLowerCase().slice(0, 120)
        : "";
    if (!isAllowedHostname(hostname) || hostname === "localhost") {
      return accepted();
    }

    const event = typeof body.event === "string" ? body.event : "";
    if (!isClientEmittableArtistEvent(event)) return accepted();

    const slug = typeof body.slug === "string" ? body.slug.slice(0, 40) : "";
    if (!slug) return accepted();

    const artistId = await resolveArtistSlug(slug);
    if (!artistId) return accepted();

    const targetKey =
      typeof body.targetKey === "string" ? body.targetKey.slice(0, 200) : null;
    const surface = typeof body.surface === "string" ? body.surface : "hub";
    if (
      !["hub", "booking_form", "shop", "large_project", "pay"].includes(surface)
    ) {
      return accepted();
    }

    const families = parseUserAgent(userAgent ?? "");
    const hash = visitorDayHash({
      secret,
      dateKey: new Date().toISOString().slice(0, 10),
      hostname,
      ip,
      uaSignal: families.stabilitySignal,
    });

    const referrerDomain = referrerDomainOf(
      typeof body.referrerDomain === "string" ? body.referrerDomain : null,
    );
    const channel = classifyChannel({
      utmSource: typeof body.utmSource === "string" ? body.utmSource : null,
      utmMedium: typeof body.utmMedium === "string" ? body.utmMedium : null,
      referrerDomain,
    });

    const { error } = await serviceClient.from("artist_page_events").insert({
      artist_id: artistId,
      surface,
      event,
      target_key: targetKey,
      visitor_hash: hash,
      channel,
      referrer_domain: referrerDomain,
      occurred_at: new Date().toISOString(),
    });
    if (error) console.error("[artist-events] insert failed", error.message);

    return accepted();
  } catch (err) {
    console.error("[artist-events] collect crashed", err);
    return accepted();
  }
}
