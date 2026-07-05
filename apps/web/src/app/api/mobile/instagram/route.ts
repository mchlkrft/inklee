import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { isInstagramConfigured } from "@/lib/instagram";
import { linkedPostKeys } from "@/lib/server/instagram-sync";
import type {
  MobileInstagram,
  MobileInstagramPost,
} from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// GET /api/mobile/instagram — connection status + the synced posts to browse in
// the native import grid. The access token is never included. Mirrors the web
// /flash/instagram page's enrichment (preview URL + already-linked flag).
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("username, last_sync_at")
    .eq("artist_id", userId)
    .eq("connected", true)
    .maybeSingle();

  let posts: MobileInstagramPost[] = [];
  if (account) {
    const { data: rows } = await supabase
      .from("instagram_posts")
      .select("id, media_type, preview_image_path, permalink, caption")
      .eq("artist_id", userId)
      .order("posted_at", { ascending: false })
      .limit(100);

    // A post is already imported if a flash item links it by id OR permalink
    // (permalink survives a disconnect -> reconnect that re-mints post ids).
    const { ids: linkedIds, urls: linkedUrls } = await linkedPostKeys(
      supabase,
      userId,
    );

    posts = (rows ?? []).map((r) => ({
      id: r.id,
      mediaType: r.media_type,
      previewUrl: r.preview_image_path
        ? supabase.storage.from("logos").getPublicUrl(r.preview_image_path).data
            .publicUrl
        : null,
      permalink: r.permalink,
      caption: r.caption,
      alreadyLinked: linkedIds.has(r.id) || linkedUrls.has(r.permalink),
    }));
  }

  const body: MobileInstagram = {
    configured: isInstagramConfigured(),
    account: account
      ? { username: account.username, lastSyncAt: account.last_sync_at }
      : null,
    posts,
  };
  return mobileOk(body);
}
