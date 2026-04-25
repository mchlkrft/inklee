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
  if (!user) return;

  const { data: account } = await supabase
    .from("instagram_accounts")
    .select("access_token")
    .eq("artist_id", user.id)
    .eq("connected", true)
    .maybeSingle();

  if (!account) return;

  try {
    const now = new Date().toISOString();
    const media = await fetchInstagramMedia(account.access_token, 50);

    if (media.length > 0) {
      await serviceClient.from("instagram_posts").upsert(
        media.map((m) => ({
          artist_id: user.id,
          instagram_media_id: m.id,
          media_type: m.media_type,
          media_url: m.media_url ?? null,
          thumbnail_url: m.thumbnail_url ?? null,
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
  }

  revalidatePath("/flash/instagram");
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
  if (!user) return { error: "not authenticated" };

  if (!postIds.length) return { error: "no posts selected" };

  const { data: posts } = await supabase
    .from("instagram_posts")
    .select("*")
    .in("id", postIds)
    .eq("artist_id", user.id);

  if (!posts?.length) return { error: "posts not found" };

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
    const previewUrl =
      post.media_type === "VIDEO" ? post.thumbnail_url : post.media_url;

    return {
      id: itemId,
      artist_id: user.id,
      title: rawTitle,
      // Append UUID prefix to guarantee uniqueness — artist can rename after import
      slug: `${slugify(rawTitle) || "flash"}-${itemId.slice(0, 8)}`,
      status: "draft",
      instagram_post_url: post.permalink,
      preview_image_url: previewUrl ?? null,
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
