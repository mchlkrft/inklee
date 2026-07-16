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
import { isCapabilityDisabled } from "@/lib/server/app-config";

// The instagram_import capability pause (docs/architecture/remote-config-plan.md
// §8) blocks connect/sync/import here AND on the /api/mobile/instagram/* routes;
// disconnect stays available (removing the integration is always allowed).

export async function connectInstagramAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isCapabilityDisabled("instagram_import")) {
    redirect("/flash/instagram?error=unavailable");
  }

  const state = generateOAuthState(user.id);
  redirect(buildOAuthUrl(state));
}

export async function syncInstagramAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (isCapabilityDisabled("instagram_import")) {
    redirect("/flash/instagram?error=unavailable");
  }

  let synced = 0;
  try {
    ({ synced } = await syncInstagramMedia(user.id));
  } catch (err) {
    // redirect() throws a control-flow signal; keep it OUT of this catch so a
    // real sync failure is the only thing that lands on error=sync_failed.
    console.error("[instagram/sync]", err);
    redirect("/flash/instagram?error=sync_failed");
  }

  if (synced === 0) {
    // Nothing synced: distinguish "not connected" from "connected, no posts".
    const { data: account } = await supabase
      .from("instagram_accounts")
      .select("connected")
      .eq("artist_id", user.id)
      .eq("connected", true)
      .maybeSingle();
    if (!account) redirect("/flash/instagram?error=not_connected");
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

  try {
    await disconnectInstagram(user.id);
  } catch (err) {
    // disconnectInstagram now throws on a DB delete failure; surface it
    // instead of rendering the page as if the teardown succeeded.
    console.error("[instagram/disconnect]", err);
    redirect("/flash/instagram?error=disconnect_failed");
  }
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
  if (isCapabilityDisabled("instagram_import")) {
    return {
      error: "Instagram import is temporarily unavailable. Try again later.",
    };
  }

  const result = await importInstagramPosts(supabase, user.id, postIds);
  if ("error" in result) return { error: result.error };

  revalidatePath("/flash/items");
  revalidatePath("/flash/instagram");
  return { created: result.created };
}
