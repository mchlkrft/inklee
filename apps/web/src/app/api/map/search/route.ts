import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { tattooMapEnabled } from "@/lib/map-features";
import {
  toPublicMapPin,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";

export const runtime = "nodejs";

export type MapSearchResponse = { results: PublicMapPin[] };

// Autosuggest for the map search box. Logged-in artists only (the map is
// not client-facing), reads through the service client + the tested public
// shaper, never client-side table access - same posture as the pins route.
// The typo/accent tolerance lives in the map_search RPC (pg_trgm + unaccent).
export async function GET(request: Request) {
  if (!tattooMapEnabled()) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  // The RPC ignores sub-2-char needles; short-circuit here to skip the round
  // trip entirely (the box fires a request on every keystroke).
  if (q.length < 2) {
    return NextResponse.json({ results: [] } satisfies MapSearchResponse);
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
  return NextResponse.json({ results } satisfies MapSearchResponse);
}
