import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serviceClient } from "@/lib/supabase/service";
import { fetchInstagramMedia, titleFromCaption } from "@/lib/instagram";
import { downloadInstagramThumbnail } from "@/lib/instagram-storage";
import { slugify } from "@/lib/flash";
import { purgeStoragePrefix } from "./storage-purge";

// One server-only implementation of the Instagram sync / import / disconnect
// flows, shared by the web actions + callback AND the /api/mobile/instagram
// routes so the two surfaces cannot drift. The access token is read via the
// service-role client and NEVER leaves the server.

const MAX_POSTS = 50;
const THUMB_CONCURRENCY = 8;

// Order-preserving bounded-concurrency map so a 50-post sync never fans out 50
// image downloads at once (guards the serverless function against a transient
// memory/CPU spike on a large batch).
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => run()),
  );
  return results;
}

/**
 * Fetch the artist's recent Instagram media, cache thumbnails, and upsert
 * instagram_posts. Reads the connected account's token via the service role.
 * Throws on a hard DB write error so the caller surfaces a real failure rather
 * than a silent success. Returns the number of posts synced (0 if not connected).
 */
export async function syncInstagramMedia(
  artistId: string,
): Promise<{ synced: number }> {
  const { data: account } = await serviceClient
    .from("instagram_accounts")
    .select("access_token")
    .eq("artist_id", artistId)
    .eq("connected", true)
    .maybeSingle();
  if (!account) return { synced: 0 };

  const now = new Date().toISOString();
  const media = await fetchInstagramMedia(account.access_token, MAX_POSTS);

  if (media.length > 0) {
    const previewPaths = await mapWithConcurrency(
      media,
      THUMB_CONCURRENCY,
      (m) => {
        const sourceUrl =
          m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
        return sourceUrl
          ? downloadInstagramThumbnail(sourceUrl, artistId, m.id)
          : Promise.resolve(null);
      },
    );

    const { error: upsertErr } = await serviceClient
      .from("instagram_posts")
      .upsert(
        media.map((m, i) => ({
          artist_id: artistId,
          instagram_media_id: m.id,
          media_type: m.media_type,
          media_url: m.media_url ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
          preview_image_path: previewPaths[i],
          permalink: m.permalink,
          caption: m.caption ?? null,
          posted_at: m.timestamp ? new Date(m.timestamp).toISOString() : null,
          synced_at: now,
        })),
        { onConflict: "artist_id,instagram_media_id" },
      );
    if (upsertErr) throw new Error(upsertErr.message);
  }

  const { error: updErr } = await serviceClient
    .from("instagram_accounts")
    .update({ last_sync_at: now, updated_at: now })
    .eq("artist_id", artistId);
  if (updErr) throw new Error(updErr.message);

  return { synced: media.length };
}

/**
 * Create draft flash items from selected Instagram posts, under the CALLER'S
 * RLS-scoped client. Dedupes on BOTH the post id and the permalink so a
 * disconnect -> reconnect (which re-mints post ids) cannot duplicate an
 * already-imported design.
 */
export async function importInstagramPosts(
  supabase: SupabaseClient,
  artistId: string,
  postIds: string[],
): Promise<{ error: string } | { created: number }> {
  if (!postIds.length) return { error: "No posts selected." };

  const { data: posts } = await supabase
    .from("instagram_posts")
    .select("*")
    .in("id", postIds)
    .eq("artist_id", artistId);
  if (!posts?.length) return { error: "Posts not found." };

  const [{ data: linkedById }, { data: linkedByUrl }] = await Promise.all([
    supabase
      .from("flash_items")
      .select("instagram_post_id")
      .in("instagram_post_id", postIds)
      .eq("artist_id", artistId)
      .not("instagram_post_id", "is", null),
    supabase
      .from("flash_items")
      .select("instagram_post_url")
      .eq("artist_id", artistId)
      .not("instagram_post_url", "is", null),
  ]);
  const linkedIds = new Set(
    (linkedById ?? []).map((r) => r.instagram_post_id as string),
  );
  const linkedUrls = new Set(
    (linkedByUrl ?? []).map((r) => r.instagram_post_url as string),
  );

  const toImport = posts.filter(
    (p) => !linkedIds.has(p.id) && !linkedUrls.has(p.permalink),
  );
  if (!toImport.length) {
    return { error: "all selected posts are already linked to flash items" };
  }

  const rows = toImport.map((post) => {
    const rawTitle = titleFromCaption(post.caption) || "Flash Design";
    const itemId = crypto.randomUUID();
    // Resolve the Supabase-hosted preview to a public URL so a flash item
    // inherits a permanent image (null if this post wasn't cached — a resync
    // then re-import fixes it).
    const previewUrl = post.preview_image_path
      ? supabase.storage.from("logos").getPublicUrl(post.preview_image_path)
          .data.publicUrl
      : null;
    return {
      id: itemId,
      artist_id: artistId,
      title: rawTitle,
      // UUID suffix guarantees per-artist slug uniqueness; renameable after.
      slug: `${slugify(rawTitle) || "flash"}-${itemId.slice(0, 8)}`,
      status: "draft",
      instagram_post_url: post.permalink,
      preview_image_url: previewUrl,
      short_description: null as string | null,
      price_type: "request",
      price: null as string | null,
      size_info: null as string | null,
      placement_notes: null as string | null,
      booking_mode: "unique",
      max_bookings: null as number | null,
      is_bookable: true,
      available_from: null as string | null,
      available_until: null as string | null,
      flash_day_id: null as string | null,
      instagram_post_id: post.id,
    };
  });

  const { error } = await supabase.from("flash_items").insert(rows);
  if (error) return { error: error.message };
  return { created: toImport.length };
}

/**
 * Full disconnect teardown (IG-01): delete the stored token row, the synced
 * posts, and the cached thumbnails. Idempotent. Already-imported flash items
 * survive — their instagram_post_id FK is ON DELETE SET NULL and they keep the
 * copied instagram_post_url + preview_image_url.
 */
export async function disconnectInstagram(artistId: string): Promise<void> {
  await serviceClient
    .from("instagram_posts")
    .delete()
    .eq("artist_id", artistId);
  await serviceClient
    .from("instagram_accounts")
    .delete()
    .eq("artist_id", artistId);
  // Instagram provides no programmatic token revoke for this API; deleting our
  // stored copy is the teardown (the token also expires ~60 days after mint).
  await purgeStoragePrefix("logos", `${artistId}/instagram`);
}
