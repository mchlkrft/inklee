import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tattooMapEnabled, publicMapApiPolicy } from "@/lib/map-features";
import { getClientIp } from "@/lib/get-client-ip";
import {
  checkPublicMapPinsRateLimit,
  checkPublicMapDetailRateLimit,
  checkPublicMapSearchRateLimit,
} from "@/lib/ratelimit";
import {
  resolveMapCapabilities,
  type MapCapabilities,
} from "@inklee/shared/map-core-state";

// The ONE enforcement point for the /api/map/* data plane (go-live plan S1).
// Every map data route resolves its request through this helper instead of
// hand-rolling flag, auth, and abuse checks, so the plane rules cannot drift
// per route:
//
// - flag off              -> 404 (the map does not exist)
// - signed-in user        -> authed plane, uncached, unlimited (as before S1)
// - anonymous, public off -> 401 (exactly the pre-S1 refusal; rollback story)
// - anonymous, public on  -> public plane, per-IP rate limited, CDN-cacheable
//
// Capabilities ride along so downstream reads gate on the capability object
// (the load-bearing fields from map-core-state), never on ad-hoc user checks.

export type MapApiAccess =
  | { kind: "authed"; userId: string; capabilities: MapCapabilities }
  | { kind: "public"; capabilities: MapCapabilities }
  | { kind: "refused"; response: NextResponse };

const PUBLIC_RATE_LIMITS = {
  pins: checkPublicMapPinsRateLimit,
  detail: checkPublicMapDetailRateLimit,
  search: checkPublicMapSearchRateLimit,
} as const;

export type PublicMapRouteKind = keyof typeof PUBLIC_RATE_LIMITS;

// Public responses are shared-cacheable so anonymous traffic mostly never
// reaches the function. `Vary: Cookie` is the plane-separation backstop:
// anonymous visitors carry no cookies and share one entry per quantized URL,
// while any cookie-bearing request keys separately and can never be served a
// cached public body in place of its authed one.
export const PUBLIC_MAP_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600",
  Vary: "Cookie",
} as const;

// Authed responses are per-viewer (or at least per-plane): never let an
// intermediary or the browser reuse them across sessions.
export const AUTHED_MAP_CACHE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export async function resolveMapApiAccess(
  request: Request,
  route: PublicMapRouteKind,
): Promise<MapApiAccess> {
  if (!tattooMapEnabled()) {
    return {
      kind: "refused",
      response: NextResponse.json({ error: "not_found" }, { status: 404 }),
    };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const policy = publicMapApiPolicy(Boolean(user));
  if (policy === "authed" && user) {
    return {
      kind: "authed",
      userId: user.id,
      capabilities: resolveMapCapabilities(user.id),
    };
  }
  if (policy === "unauthorized") {
    return {
      kind: "refused",
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  // Public plane: refuse-before-work. The limiter is the abuse control that
  // replaces the auth gate; a limiter failure (or unconfigured Redis in
  // production) refuses rather than serving unmetered.
  //
  // Keying on first-entry x-forwarded-for is safe ONLY under the Vercel
  // platform guarantee that the header is overwritten at the edge (client
  // values discarded, always present). Behind any other proxy this key is
  // client-spoofable (limiter bypass) and its absence would collapse everyone
  // into one shared "unknown" bucket; re-key before ever deploying elsewhere.
  const ip = getClientIp(request.headers);
  const { allowed } = await PUBLIC_RATE_LIMITS[route](ip);
  if (!allowed) {
    return {
      kind: "refused",
      response: NextResponse.json({ error: "rate_limited" }, { status: 429 }),
    };
  }
  return { kind: "public", capabilities: resolveMapCapabilities(null) };
}
