"use server";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/notification-types";

type NotificationsResult = {
  notifications: Notification[];
  error?: string;
};

type MutationResult = { success: true } | { error: string };

export async function fetchNotificationsAction(): Promise<NotificationsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { notifications: [], error: "not authenticated" };

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("artist_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  if (error) {
    console.error("[notifications/fetch]", error.message, {
      artistId: user.id,
    });
    return { notifications: [], error: error.message };
  }

  return { notifications: (data ?? []) as Notification[] };
}

export async function markReadAction(ids: string[]): Promise<MutationResult> {
  if (!ids.length) return { success: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("artist_id", user.id);

  if (error) {
    console.error("[notifications/mark-read]", error.message, {
      artistId: user.id,
      ids,
    });
    return { error: error.message };
  }

  return { success: true };
}

export async function markAllReadAction(): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("artist_id", user.id)
    .eq("is_read", false);

  if (error) {
    console.error("[notifications/mark-all-read]", error.message, {
      artistId: user.id,
    });
    return { error: error.message };
  }

  return { success: true };
}

export async function resolveWarningAction(
  id: string,
): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not authenticated" };

  const { error } = await supabase
    .from("notifications")
    .update({ is_resolved: true, is_read: true })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) {
    console.error("[notifications/resolve]", error.message, {
      artistId: user.id,
      id,
    });
    return { error: error.message };
  }

  return { success: true };
}
