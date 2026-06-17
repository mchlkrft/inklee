// Flash day <-> design membership core — the SINGLE writer of the
// flash_day_items junction (migration 0051) and the one reader for artist-facing
// rosters/counts. Both the web server actions (apps/web/.../flash/days/actions.ts)
// and the mobile routes (/api/mobile/flash/days/[id]/items) call this, so the two
// platforms cannot drift (ME-10 — same pattern as lib/server/slots.ts).
//
// IMPORTANT (web-server-only): every function takes an injected RLS-scoped
// SupabaseClient (web cookie client OR mobile Bearer client). Never pass the
// service client here — RLS is the outer guard and the in-module artist_id checks
// are defense-in-depth. The React Native app must reach this only via /api/mobile.
//
// While the junction is the source of truth for day rosters, this module also
// keeps flash_items.flash_day_id synced as a back-compat "primary day" hint so
// legacy readers (the per-design subpage "featured day", the days-index count)
// stay correct until they cut over.

import type { SupabaseClient } from "@supabase/supabase-js";

// Statuses a folder snapshots into a day when "add a whole folder" is used:
// published + draft (a draft becomes visible publicly once published), never
// archived. A snapshot, not a live link — later additions to the folder do not
// auto-join days the folder was already added to.
export const FLASH_FOLDER_SNAPSHOT_STATUSES = ["published", "draft"] as const;

export type FlashRosterItem = {
  id: string;
  title: string;
  slug: string;
  status: string;
  preview_image_url: string | null;
  position: number;
};

type Ok<T> = ({ ok: true } & T) | { ok: false; error: string };

// ── pure helpers (unit-tested in __tests__/flash-membership.test.ts) ──────────

/** Positions to assign to `count` newly-appended items given the day's current
 *  max position (-1 when the day is empty). */
export function nextPositions(currentMax: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => currentMax + 1 + i);
}

/** The item's flash_day_id ("primary day") after detaching it from one day.
 *  If the detached day was the primary, fall back to any day the design is still
 *  in (else null); otherwise the primary is unchanged. */
export function resolvePrimaryDayOnDetach(
  currentPrimary: string | null,
  detachedDayId: string,
  remainingDayIds: string[],
): string | null {
  if (currentPrimary !== detachedDayId) return currentPrimary;
  return remainingDayIds[0] ?? null;
}

// ── reads ─────────────────────────────────────────────────────────────────────

/** The designs in a day, ordered by roster position (artist-facing: all
 *  statuses). The public grid uses its own status-filtered serviceClient query. */
export async function listDayRoster(
  supabase: SupabaseClient,
  dayId: string,
  artistId: string,
): Promise<{ items: FlashRosterItem[] } | { error: string }> {
  const { data, error } = await supabase
    .from("flash_day_items")
    .select(
      "position, flash_items!item_id(id, title, slug, status, preview_image_url)",
    )
    .eq("day_id", dayId)
    .eq("artist_id", artistId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) return { error: error.message };

  const items: FlashRosterItem[] = [];
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const raw = row.flash_items;
    const fi = (Array.isArray(raw) ? raw[0] : raw) as
      | Record<string, unknown>
      | null
      | undefined;
    if (!fi?.id) continue;
    items.push({
      id: fi.id as string,
      title: fi.title as string,
      slug: fi.slug as string,
      status: fi.status as string,
      preview_image_url: (fi.preview_image_url as string | null) ?? null,
      position: (row.position as number) ?? 0,
    });
  }
  return { items };
}

/** Design counts per day for the artist (the days-list / mobile-days-list
 *  count). Pass dayIds to scope; omit for all of the artist's days. */
export async function countDayItems(
  supabase: SupabaseClient,
  artistId: string,
  dayIds?: string[],
): Promise<{ counts: Record<string, number> } | { error: string }> {
  let q = supabase
    .from("flash_day_items")
    .select("day_id")
    .eq("artist_id", artistId);
  if (dayIds && dayIds.length > 0) q = q.in("day_id", dayIds);
  const { data, error } = await q;
  if (error) return { error: error.message };
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ day_id: string }>) {
    counts[row.day_id] = (counts[row.day_id] ?? 0) + 1;
  }
  return { counts };
}

// ── writes (single writer of flash_day_items) ─────────────────────────────────

/** Attach designs to a day. Idempotent (re-attaching is a no-op), cross-artist
 *  items are dropped, and any attached design without a primary day gets this
 *  day as its flash_day_id. */
export async function attachItemsToDay(
  supabase: SupabaseClient,
  dayId: string,
  itemIds: string[],
  artistId: string,
): Promise<Ok<{ attached: number }>> {
  if (itemIds.length === 0) return { ok: true, attached: 0 };

  const { data: day, error: dayErr } = await supabase
    .from("flash_days")
    .select("id")
    .eq("id", dayId)
    .eq("artist_id", artistId)
    .maybeSingle();
  if (dayErr) return { ok: false, error: dayErr.message };
  if (!day) return { ok: false, error: "Flash day not found." };

  // Keep only designs the artist owns (defense-in-depth on top of RLS).
  const { data: owned, error: ownErr } = await supabase
    .from("flash_items")
    .select("id, flash_day_id")
    .eq("artist_id", artistId)
    .in("id", itemIds);
  if (ownErr) return { ok: false, error: ownErr.message };
  const ownedRows = (owned ?? []) as Array<{
    id: string;
    flash_day_id: string | null;
  }>;
  const valid = ownedRows.map((r) => r.id);
  if (valid.length === 0) return { ok: true, attached: 0 };

  const { data: maxRow } = await supabase
    .from("flash_day_items")
    .select("position")
    .eq("day_id", dayId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const currentMax = (maxRow as { position: number } | null)?.position ?? -1;
  const positions = nextPositions(currentMax, valid.length);

  const rows = valid.map((itemId, i) => ({
    day_id: dayId,
    item_id: itemId,
    artist_id: artistId,
    position: positions[i],
  }));
  const { error: insErr } = await supabase
    .from("flash_day_items")
    .upsert(rows, { onConflict: "day_id,item_id", ignoreDuplicates: true });
  if (insErr) return { ok: false, error: insErr.message };

  // Sync the primary-day hint for designs that had none.
  const needsPrimary = ownedRows
    .filter((r) => r.flash_day_id == null)
    .map((r) => r.id);
  if (needsPrimary.length > 0) {
    await supabase
      .from("flash_items")
      .update({ flash_day_id: dayId })
      .eq("artist_id", artistId)
      .in("id", needsPrimary);
  }

  return { ok: true, attached: valid.length };
}

/** Attach every published/draft design in a folder to a day (snapshot). */
export async function attachFolderToDay(
  supabase: SupabaseClient,
  dayId: string,
  folderId: string,
  artistId: string,
): Promise<Ok<{ attached: number }>> {
  const { data: members, error } = await supabase
    .from("flash_items")
    .select("id")
    .eq("artist_id", artistId)
    .eq("folder_id", folderId)
    .in("status", [...FLASH_FOLDER_SNAPSHOT_STATUSES]);
  if (error) return { ok: false, error: error.message };
  const itemIds = ((members ?? []) as Array<{ id: string }>).map((r) => r.id);
  return attachItemsToDay(supabase, dayId, itemIds, artistId);
}

/** Remove a design from a day, repointing its primary-day hint if needed. */
export async function detachItemFromDay(
  supabase: SupabaseClient,
  dayId: string,
  itemId: string,
  artistId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error: delErr } = await supabase
    .from("flash_day_items")
    .delete()
    .eq("day_id", dayId)
    .eq("item_id", itemId)
    .eq("artist_id", artistId);
  if (delErr) return { ok: false, error: delErr.message };

  const { data: item } = await supabase
    .from("flash_items")
    .select("flash_day_id")
    .eq("id", itemId)
    .eq("artist_id", artistId)
    .maybeSingle();
  const currentPrimary =
    (item as { flash_day_id: string | null } | null)?.flash_day_id ?? null;
  if (currentPrimary === dayId) {
    const { data: remaining } = await supabase
      .from("flash_day_items")
      .select("day_id")
      .eq("item_id", itemId)
      .eq("artist_id", artistId)
      .order("position", { ascending: true });
    const remainingDayIds = (
      (remaining ?? []) as Array<{ day_id: string }>
    ).map((r) => r.day_id);
    const newPrimary = resolvePrimaryDayOnDetach(
      currentPrimary,
      dayId,
      remainingDayIds,
    );
    if (newPrimary !== currentPrimary) {
      await supabase
        .from("flash_items")
        .update({ flash_day_id: newPrimary })
        .eq("id", itemId)
        .eq("artist_id", artistId);
    }
  }
  return { ok: true };
}

/** Persist a new roster order (positions follow the given item order). */
export async function reorderDayItems(
  supabase: SupabaseClient,
  dayId: string,
  orderedItemIds: string[],
  artistId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (let i = 0; i < orderedItemIds.length; i++) {
    const { error } = await supabase
      .from("flash_day_items")
      .update({ position: i })
      .eq("day_id", dayId)
      .eq("item_id", orderedItemIds[i])
      .eq("artist_id", artistId);
    if (error) return { ok: false, error: error.message };
  }
  return { ok: true };
}
