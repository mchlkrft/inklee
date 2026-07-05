"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { generateOAuthState, buildOAuthUrl } from "@/lib/instagram";
import {
  syncInstagramMedia,
  importInstagramPosts,
  disconnectInstagram,
} from "@/lib/server/instagram-sync";

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

  try {
    const { synced } = await syncInstagramMedia(user.id);
    if (synced === 0) {
      // No connected account (or nothing to sync).
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("connected")
        .eq("artist_id", user.id)
        .eq("connected", true)
        .maybeSingle();
      if (!account) redirect("/flash/instagram?error=not_connected");
    }
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

  await disconnectInstagram(user.id);
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

  const result = await importInstagramPosts(supabase, user.id, postIds);
  if ("error" in result) return { error: result.error };

  revalidatePath("/flash/items");
  revalidatePath("/flash/instagram");
  return { created: result.created };
}
