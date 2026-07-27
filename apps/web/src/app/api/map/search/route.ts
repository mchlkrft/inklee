import { NextResponse } from "next/server";
import { serviceClient } from "@/lib/supabase/service";
import {
  toPublicMapPin,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import {
  resolveMapApiAccess,
  PUBLIC_MAP_CACHE_HEADERS,
  AUTHED_MAP_CACHE_HEADERS,
} from "@/lib/server/map-public-access";

export const runtime = "nodejs";

export type MapSearchResponse = { results: PublicMapPin[] };

// Autosuggest for the map search box. Dual-plane since go-live plan S1: the
// result body is viewer-independent (the tested public shaper), so both planes
// share it; the anonymous branch carries the tightest public rate limit
// because the box fires a request per keystroke. Reads go through the service
// client, never client-side table access. The typo/accent tolerance lives in
// the map_search RPC (pg_trgm + unaccent).
export async function GET(request: Request) {
  const access = await resolveMapApiAccess(request, "search");
  if (access.kind === "refused") {
    return access.response;
  }
  const headers =
    access.kind === "public"
      ? PUBLIC_MAP_CACHE_HEADERS
      : AUTHED_MAP_CACHE_HEADERS;

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  // The RPC ignores sub-2-char needles; short-circuit here to skip the round
  // trip entirely. The upper cap is the anonymous-plane cost guard (S1 review):
  // the RPC runs trigram similarity over every approved row, a multi-KB junk
  // needle defeats the GIN indexes, and every unique q is a guaranteed CDN
  // miss, so the per-IP limiter alone does not bound per-request cost. No real
  // studio or city name approaches the cap; over-long input gets the same
  // empty body a too-short one does.
  const MAX_SEARCH_QUERY_LENGTH = 100;
  if (q.length < 2 || q.length > MAX_SEARCH_QUERY_LENGTH) {
    return NextResponse.json({ results: [] } satisfies MapSearchResponse, {
      headers,
    });
  }

  const { data, error } = await serviceClient.rpc("map_search", {
    p_q: q,
    p_limit: 8,
  });
  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const results = ((data ?? []) as MapLocationRowForPin[])
    .map((row) => toPublicMapPin(row))
    .filter((p): p is PublicMapPin => p !== null);
  return NextResponse.json({ results } satisfies MapSearchResponse, {
    headers,
  });
}
