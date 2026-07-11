"use server";

import { revalidatePath } from "next/cache";
import { getAdminId } from "@/lib/admin-guard";
import { writeAudit } from "@/lib/audit";
import { serviceClient } from "@/lib/supabase/service";
import { runScheduledSync, latestFinalizedDate } from "@/lib/gsc/sync";

type State = { error: string } | { ok: true } | null;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Choose which Search Console property the cockpit reads. */
export async function selectGscPropertyAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const propertyId = formData.get("property_id");
  if (typeof propertyId !== "string" || !UUID_RE.test(propertyId)) {
    return { error: "Invalid property." };
  }

  const { data: property } = await serviceClient
    .from("gsc_properties")
    .select("id, connection_id")
    .eq("id", propertyId)
    .maybeSingle();
  if (!property) return { error: "Property not found." };

  await serviceClient
    .from("gsc_properties")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("connection_id", property.connection_id);
  const { error } = await serviceClient
    .from("gsc_properties")
    .update({ is_active: true, updated_at: new Date().toISOString() })
    .eq("id", propertyId);
  if (error) return { error: "Could not select the property." };

  revalidatePath("/admin/growth/search");
  return { ok: true };
}

/** Disconnect Search Console (retires the stored refresh token; synced data
 *  is kept until reconnected or manually cleared). */
export async function disconnectGscAction(): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const { error } = await serviceClient
    .from("gsc_connections")
    .update({ disconnected_at: new Date().toISOString() })
    .is("disconnected_at", null);
  if (error) return { error: "Could not disconnect." };

  void writeAudit({
    action: "admin_gsc_disconnected",
    actor: adminId,
    category: "admin",
  });
  revalidatePath("/admin/growth/search");
  return { ok: true };
}

/**
 * Start a resumable backfill (90 days by default, or all available history:
 * Search Console keeps ~16 months). The daily sync cron advances it in
 * bounded batches; this action also kicks the first batch immediately.
 */
export async function startGscBackfillAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const mode = formData.get("mode") === "all" ? "all" : "90";

  const { data: connection } = await serviceClient
    .from("gsc_connections")
    .select("id")
    .is("disconnected_at", null)
    .limit(1)
    .maybeSingle();
  if (!connection) return { error: "Connect Search Console first." };
  const { data: property } = await serviceClient
    .from("gsc_properties")
    .select("id")
    .eq("connection_id", connection.id)
    .eq("is_active", true)
    .maybeSingle();
  if (!property) return { error: "Select a property first." };

  // Fast-path friendly message; the partial unique index
  // gsc_backfills_one_running_idx (migration 0071) is the authoritative guard
  // against a check-then-insert race.
  const { data: running } = await serviceClient
    .from("gsc_backfills")
    .select("id")
    .eq("property_id", property.id)
    .eq("status", "running")
    .limit(1)
    .maybeSingle();
  if (running) return { error: "A backfill is already running." };

  const toDate = latestFinalizedDate();
  const days = mode === "all" ? 480 : 90; // ~16 months is GSC's retention
  const fromDate = new Date(
    new Date(`${toDate}T00:00:00Z`).getTime() - (days - 1) * 86_400_000,
  )
    .toISOString()
    .slice(0, 10);

  const { error } = await serviceClient.from("gsc_backfills").insert({
    property_id: property.id,
    from_date: fromDate,
    to_date: toDate,
    cursor_date: toDate,
    status: "running",
  });
  if (error) {
    // 23505 = the one-running-per-property unique index fired: a concurrent
    // click won the race.
    if (error.code === "23505")
      return { error: "A backfill is already running." };
    return { error: "Could not start the backfill." };
  }

  void writeAudit({
    action: "admin_gsc_backfill_started",
    actor: adminId,
    category: "admin",
  });

  // Kick the first batch now (the cron advances the rest daily; the admin can
  // also press "Sync now" repeatedly to advance faster).
  await runScheduledSync();
  revalidatePath("/admin/growth/search");
  return { ok: true };
}

/** Run one sync pass now (rolling window + one backfill batch). */
export async function triggerGscSyncAction(): Promise<State> {
  const adminId = await getAdminId();
  if (!adminId) return { error: "Not authorized." };

  const summary = await runScheduledSync();
  revalidatePath("/admin/growth/search");
  if ("skipped" in summary) return { error: summary.skipped };
  if (!summary.ok) {
    return {
      error: summary.failures[0] ?? "Sync failed. Check the sync status card.",
    };
  }
  return { ok: true };
}
