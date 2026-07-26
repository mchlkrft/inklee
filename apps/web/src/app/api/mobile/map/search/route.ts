import { serviceClient } from "@/lib/supabase/service";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  toPublicMapPin,
  type MapLocationRowForPin,
  type PublicMapPin,
} from "@inklee/shared/map-directory";
import type { MobileMapSearchResponse } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../_lib";

export const runtime = "nodejs";

// Native twin of GET /api/map/search: pg_trgm + unaccent live in the RPC.
export async function GET(req: Request) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return mobileOk({ results: [] } satisfies MobileMapSearchResponse);
  }

  const { data, error } = await serviceClient.rpc("map_search", {
    p_q: q,
    p_limit: 8,
  });
  if (error) return mobileError(500, "Search failed.", "query_failed");

  const results = ((data ?? []) as MapLocationRowForPin[])
    .map((row) => toPublicMapPin(row))
    .filter((p): p is PublicMapPin => p !== null);
  return mobileOk({ results } satisfies MobileMapSearchResponse);
}
