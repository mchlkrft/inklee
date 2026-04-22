"use server";

import { createClient } from "@/lib/supabase/server";
import type { Notification } from "@/lib/notification-types";

export async function fetchNotificationsAction(): Promise<Notification[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("artist_id", user.id)
    .order("created_at", { ascending: false })
    .limit(60);

  return (data ?? []) as Notification[];
}

export async function markReadAction(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .in("id", ids)
    .eq("artist_id", user.id);
}

export async function markAllReadAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("artist_id", user.id)
    .eq("is_read", false);
}

export async function resolveWarningAction(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ is_resolved: true, is_read: true })
    .eq("id", id)
    .eq("artist_id", user.id);
}
