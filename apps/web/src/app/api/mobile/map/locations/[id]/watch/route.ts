import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { toggleWatchCore } from "@/lib/server/map-watch";
import type { MobileMapWatchResult } from "@inklee/shared/mobile-api";
import { mapMobileGate } from "../../../_lib";

export const runtime = "nodejs";

// Watch/unwatch toggle: the SAME core as the web action (own-row RLS via the
// authed client; approved-only probe guard inside the core).
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = mapMobileGate();
  if (gate) return gate;
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  const { id } = await params;
  const result = await toggleWatchCore(auth.supabase, auth.userId, id);
  if (result.error || result.watched === undefined) {
    // Unknown/not-approved location is a 404 like the sibling detail/request
    // routes; only a real write failure is a 400.
    if (result.code === "not_found") {
      return mobileError(
        404,
        result.error ?? "This place is not on the map.",
        "not_found",
      );
    }
    return mobileError(
      400,
      result.error ?? "Could not update your watched list.",
    );
  }
  return mobileOk({ watched: result.watched } satisfies MobileMapWatchResult);
}
