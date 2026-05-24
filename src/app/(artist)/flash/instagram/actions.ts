"use server";

import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  generateOAuthState,
  buildOAuthUrl,
  fetchInstagramMedia,
  titleFromCaption,
} from "@/lib/instagram";
import { downloadInstagramThumbnail } from "@/lib/instagram-storage";
import { slugify } from "@/lib/flash";

export async function connectInstagramAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const state = generateOAuthState(user.id);
  redirect(buildOAuthUrl(state));
}

export async function syncInstagramAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("access_token")
    .eq("artist_id", user.id)
    .eq("connected", true)
    .maybeSingle();

  if (!account) redirect("/flash/instagram?error=not_connected");

  try {
    const now = new Date().toISOString();
    const media = await fetchInstagramMedia(account.access_token, 50);

    if (media.length > 0) {
      const previewPaths = await Promise.all(
        media.map((m) => {
          const sourceUrl =
            m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url;
          return sourceUrl
            ? downloadInstagramThumbnail(sourceUrl, user.id, m.id)
            : Promise.resolve(null);
        }),
      );

      await serviceClient.from("instagram_posts").upsert(
        media.map((m, i) => ({
          artist_id: user.id,
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
    }

    await serviceClient
      .from("instagram_accounts")
      .update({ last_sync_at: now, updated_at: now })
      .eq("artist_id", user.id);
  } catch (err) {
    console.error("[instagram/sync]", err);
    redirect("/flash/instagram?error=sync_failed");
  }

  revalidatePath("/flash/instagram");
  redirect("/flash/instagram?synced=1");
}

export async function disconnectInstagramAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const now = new Date().toISOString();
  await supabase
    .from("instagram_accounts")
    .update({ connected: false, updated_at: now })
    .eq("artist_id", user.id);

  revalidatePath("/flash/instagram");
}

export async function importPostsAsFlashItemsAction(
  postIds: string[],
): Promise<{ error?: string; created?: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  if (!postIds.length) return { error: "No posts selected." };

  const { data: posts } = await supabase
    .from("instagram_posts")
    .select("*")
    .in("id", postIds)
    .eq("artist_id", user.id);

  if (!posts?.length) return { error: "Posts not found." };

  // Exclude posts already linked to a flash item
  const { data: linked } = await supabase
    .from("flash_items")
    .select("instagram_post_id")
    .in("instagram_post_id", postIds)
    .eq("artist_id", user.id)
    .not("instagram_post_id", "is", null);

  const alreadyLinked = new Set(
    (linked ?? []).map((r) => r.instagram_post_id as string),
  );
  const toImport = posts.filter((p) => !alreadyLinked.has(p.id));

  if (!toImport.length)
    return {
      error: "all selected posts are already linked to flash items",
    };

  const rows = toImport.map((post) => {
    const rawTitle = titleFromCaption(post.caption) || "Flash Design";
    const itemId = crypto.randomUUID();
    // Resolve Supabase-hosted preview to a public URL so flash items inherit
    // a permanent image. Fall back to null if sync hasn't cached this post yet —
    // artist can re-run a Resync, then re-import.
    const previewUrl = post.preview_image_path
      ? supabase.storage.from("logos").getPublicUrl(post.preview_image_path)
          .data.publicUrl
      : null;

    return {
      id: itemId,
      artist_id: user.id,
      title: rawTitle,
      // Append UUID prefix to guarantee uniqueness — artist can rename after import
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

  revalidatePath("/flash/items");
  revalidatePath("/flash/instagram");
  return { created: toImport.length };
}
