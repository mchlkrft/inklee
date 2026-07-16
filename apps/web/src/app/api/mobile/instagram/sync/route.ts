import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { syncInstagramMedia } from "@/lib/server/instagram-sync";
import { isCapabilityDisabled } from "@/lib/server/app-config";
import type { MobileInstagramSyncResult } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";
// Thumbnail downloads can add ~5-15s to a 50-post sync.
export const maxDuration = 60;

// POST /api/mobile/instagram/sync — re-pull the artist's recent Instagram media.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  // Authoritative half of the instagram_import capability pause — the client
  // hides the entry point, this refuses the action regardless.
  if (isCapabilityDisabled("instagram_import")) {
    return mobileError(
      503,
      "Instagram sync is temporarily unavailable. Try again later.",
      "capability_disabled",
    );
  }

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("id")
    .eq("artist_id", userId)
    .eq("connected", true)
    .maybeSingle();
  if (!account) {
    return mobileError(409, "Instagram is not connected.", "not_connected");
  }

  try {
    const { synced } = await syncInstagramMedia(userId);
    const body: MobileInstagramSyncResult = { synced };
    return mobileOk(body);
  } catch {
    return mobileError(502, "Instagram sync failed. Try again.", "sync_failed");
  }
}
