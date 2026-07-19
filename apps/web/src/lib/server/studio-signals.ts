import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { writeAudit } from "@/lib/audit";
import {
  STUDIO_SIGNAL_CAP_WINDOW_DAYS,
  STUDIO_SIGNAL_LABELS,
  STUDIO_SIGNAL_MONTHLY_CAP,
  isStudioSignalType,
  signalExpiry,
  type StudioSignalType,
} from "@inklee/shared/studio-signals";
import { pageAll } from "@/lib/server/map-seeding";

// Temporary studio signals server core (Q7 resolved 2026-07-19). Writes are
// owner-gated here; the public surface is the pins API ring + the detail
// page section; watchers get an IN-APP notification only (no email, no
// push - founder decision).

export type ActiveSignal = {
  id: string;
  signalType: StudioSignalType;
  createdAt: string;
  expiresAt: string;
};

export async function activeSignalForStudio(
  studioProfileId: string,
): Promise<ActiveSignal | null> {
  const { data } = await serviceClient
    .from("studio_signals")
    .select("id, signal_type, created_at, expires_at")
    .eq("studio_profile_id", studioProfileId)
    .is("withdrawn_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    signalType: data.signal_type as StudioSignalType,
    createdAt: data.created_at as string,
    expiresAt: data.expires_at as string,
  };
}

/**
 * location id -> active signal type, for the pins API and detail page.
 * Joined on a PUBLISHED studio: suspending or unpublishing a studio kills
 * its signal display instantly (the admin kill switch is suspension).
 */
export async function activeSignalsByLocation(
  locationIds: string[],
): Promise<Map<string, StudioSignalType>> {
  const out = new Map<string, StudioSignalType>();
  if (!locationIds.length) return out;
  for (let i = 0; i < locationIds.length; i += 200) {
    const { data } = await serviceClient
      .from("studio_signals")
      .select(
        "map_location_id, signal_type, created_at, studio_profiles!inner(publication_status)",
      )
      .in("map_location_id", locationIds.slice(i, i + 200))
      .is("withdrawn_at", null)
      .gt("expires_at", new Date().toISOString())
      .eq("studio_profiles.publication_status", "published")
      .order("created_at", { ascending: false });
    for (const row of data ?? []) {
      // Newest wins deterministically when more than one row exists.
      if (row.map_location_id && !out.has(row.map_location_id as string))
        out.set(
          row.map_location_id as string,
          row.signal_type as StudioSignalType,
        );
    }
  }
  return out;
}

export async function postStudioSignalCore(
  ownerId: string,
  signalType: string,
): Promise<{ error?: string; signal?: ActiveSignal }> {
  if (!isStudioSignalType(signalType))
    return { error: "Pick a valid signal type." };

  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("id, publication_status, name")
    .eq("owner_user_id", ownerId)
    .maybeSingle();
  if (!studio) return { error: "You do not own a studio." };
  if (studio.publication_status !== "published")
    return { error: "Publish your studio before posting a signal." };

  // The locked cap: one signal per owner per rolling month, counted against
  // creation. Withdrawing does not free a repost (anti-spam by design).
  const windowStart = new Date(
    Date.now() - STUDIO_SIGNAL_CAP_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { count } = await serviceClient
    .from("studio_signals")
    .select("id", { count: "exact", head: true })
    .eq("created_by", ownerId)
    .gte("created_at", windowStart);
  if ((count ?? 0) >= STUDIO_SIGNAL_MONTHLY_CAP)
    return {
      error: `You already posted a signal this month (limit ${STUDIO_SIGNAL_MONTHLY_CAP} per ${STUDIO_SIGNAL_CAP_WINDOW_DAYS} days).`,
    };

  // The signal's whole point is public display: without a live map entry
  // the post would silently burn the monthly slot and notify watchers into
  // a dead link, so it is refused instead.
  const { data: location } = await serviceClient
    .from("map_locations")
    .select("id, moderation_status")
    .eq("studio_profile_id", studio.id as string)
    .maybeSingle();
  if (!location || location.moderation_status !== "approved")
    return {
      error:
        "Your studio's map entry is not live yet, so a signal would not show anywhere.",
    };

  const now = new Date();
  const { data: created, error } = await serviceClient
    .from("studio_signals")
    .insert({
      studio_profile_id: studio.id,
      map_location_id: location.id,
      signal_type: signalType,
      created_by: ownerId,
      expires_at: signalExpiry(now).toISOString(),
    })
    .select("id, signal_type, created_at, expires_at")
    .single();
  if (error) {
    // The month-bucket unique index: the race-proof cap backstop.
    if (error.code === "23505")
      return { error: "You already posted a signal this month." };
    return { error: "Could not post the signal." };
  }
  if (!created) return { error: "Could not post the signal." };

  await writeAudit({
    action: "studio_signal_posted",
    actor: ownerId,
    category: "system",
    details: { studio_profile_id: studio.id, signal_type: signalType },
  });

  // Watcher fan-out: in-app feed only, never email or push (Q7). The owner
  // never notifies themselves.
  if (location.id) {
    const watchers = await pageAll<{ artist_user_id: string }>(
      (from, to) =>
        serviceClient
          .from("watched_studios")
          .select("artist_user_id")
          .eq("map_location_id", location.id as string)
          .order("id", { ascending: true })
          .range(from, to),
      5000,
    );
    const label = STUDIO_SIGNAL_LABELS[signalType as StudioSignalType];
    const rows = watchers
      .filter((w) => w.artist_user_id !== ownerId)
      .map((w) => ({
        artist_id: w.artist_user_id,
        type: "studio_signal",
        category: "info",
        priority: "low",
        title: `${studio.name ?? "A studio you watch"}: ${label}`,
        message: `A studio you watch posted a signal: ${label}.`,
        cta_label: "View studio",
        cta_href: `/map/${location.id}`,
        metadata: {
          studio_profile_id: studio.id,
          map_location_id: location.id,
          signal_type: signalType,
        },
      }));
    for (let i = 0; i < rows.length; i += 500) {
      const { error: fanoutError } = await serviceClient
        .from("notifications")
        .insert(rows.slice(i, i + 500));
      if (fanoutError) {
        // Partial fanout is survivable; silent partial fanout is not.
        console.error(
          `studio-signals: watcher fanout chunk failed (${fanoutError.message})`,
        );
      }
    }
  }

  return {
    signal: {
      id: created.id as string,
      signalType: created.signal_type as StudioSignalType,
      createdAt: created.created_at as string,
      expiresAt: created.expires_at as string,
    },
  };
}

export async function withdrawStudioSignalCore(
  ownerId: string,
  signalId: string,
): Promise<{ error?: string }> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("id")
    .eq("owner_user_id", ownerId)
    .maybeSingle();
  if (!studio) return { error: "You do not own a studio." };
  const { data } = await serviceClient
    .from("studio_signals")
    .update({ withdrawn_at: new Date().toISOString() })
    .eq("id", signalId)
    .eq("studio_profile_id", studio.id as string)
    .is("withdrawn_at", null)
    .select("id");
  if (!data?.length) return { error: "No active signal to withdraw." };
  return {};
}
