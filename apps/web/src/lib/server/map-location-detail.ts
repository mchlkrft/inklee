import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { publicMapEnabled } from "@/lib/map-features";
import {
  getStudioStyles,
  type StudioStylesForDisplay,
} from "@/lib/server/studio-styles";
import { getPublishedHouseRules } from "@/lib/server/studios";
import {
  getStudioGuestTimeline,
  type StudioTimeline,
} from "@/lib/server/guest-spots";
import { activeSignalsByLocation } from "@/lib/server/studio-signals";

// The read-model for a single map location's detail (map redesign Slice 1:
// in-canvas detail). ONE source shared by the /api/map/locations/[id] endpoint
// that feeds the immersive detail panel and (potentially) the /map/[id] page.
// Approved rows only (fail closed); deeper actions (claim, request, report)
// stay on their own routes - the map initiates, it never duplicates workflows.

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export type {
  MapLocationDetail,
  MapLocationDetailShared,
} from "@inklee/shared/map-location-detail";
import type {
  MapLocationDetail,
  MapLocationDetailShared,
} from "@inklee/shared/map-location-detail";

// Go-live plan S1 split: `loadDetail` produces the viewer-INDEPENDENT payload
// (plus the owner id, which never leaves this module); the public plane serves
// that payload as-is, so an anonymous (and CDN-cached) response structurally
// cannot carry viewer data. The authed composition below decorates it with the
// viewer state and keeps the pre-split wire shape for the web panel and the
// /api/mobile/map twin.

type LoadedDetail = {
  detail: MapLocationDetailShared;
  /** Internal only: needed for the authed ownStudio decoration. */
  ownerUserId: string | null;
};

async function loadDetail(id: string): Promise<LoadedDetail | null> {
  const { data } = await serviceClient
    .from("map_locations")
    .select(
      "id, name, category, address, city, country, website_url, instagram_handle, phone, opening_hours, claim_status, is_seed, last_confirmed_at, possibly_closed, studio_profile_id",
    )
    .eq("id", id)
    .eq("moderation_status", "approved")
    .maybeSingle();
  if (!data) return null;

  const claimed = (data.claim_status as string) === "claimed";
  const studioProfileId = data.studio_profile_id as string | null;

  // Structural guard (locked scope rule: a private studio is never shown at
  // its exact position): unclaimed seeded private_studio rows carry the true
  // street address from the seed sources, so the read model withholds it
  // regardless of what the row says. The S3/D3 data remediation (display
  // offset + nulled address) makes this permanent at the data layer; this
  // guard makes the rule hold by construction either way. A CLAIMED private
  // studio's address visibility is owner-controlled upstream.
  const withholdAddress =
    (data.category as string) === "private_studio" && !claimed;

  const signals = await activeSignalsByLocation([id]);

  let styles: StudioStylesForDisplay | null = null;
  let houseRules: { key: string; content: string }[] = [];
  let timeline: StudioTimeline | null = null;
  let requestable = false;
  let ownerUserId: string | null = null;
  let studioSlug: string | null = null;
  if (studioProfileId) {
    const { data: studio } = await serviceClient
      .from("studio_profiles")
      .select("owner_user_id, publication_status, guest_spot_status, slug")
      .eq("id", studioProfileId)
      .maybeSingle();
    ownerUserId = (studio?.owner_user_id as string | null) ?? null;
    requestable =
      studio?.publication_status === "published" &&
      studio.guest_spot_status === "accepting";
    if (studio?.publication_status === "published") {
      // Only a claimed + published studio has a rendering entity page, and
      // only once the public surface is live: /studios/[slug] 404s while the
      // flag is off, so exposing the slug earlier would put a dead link on
      // the authed map. Gated at the source so both link sites and the
      // mobile twin inherit it.
      studioSlug =
        claimed && publicMapEnabled()
          ? ((studio.slug as string | null) ?? null)
          : null;
      [houseRules, timeline, styles] = await Promise.all([
        getPublishedHouseRules(studioProfileId),
        getStudioGuestTimeline(studioProfileId),
        getStudioStyles(studioProfileId),
      ]);
    }
  }

  return {
    detail: {
      id: data.id as string,
      name: data.name as string,
      category: data.category as string,
      claimed,
      unverified: Boolean(data.is_seed) && !claimed,
      lastConfirmedAt: (data.last_confirmed_at as string | null) ?? null,
      possiblyClosed: Boolean(data.possibly_closed),
      signal: signals.get(id) ?? null,
      address: withholdAddress
        ? null
        : ((data.address as string | null) ?? null),
      city: (data.city as string | null) ?? null,
      country: (data.country as string | null) ?? null,
      website: safeHttpUrl(data.website_url as string | null),
      instagram: (data.instagram_handle as string | null) ?? null,
      phone: (data.phone as string | null) ?? null,
      openingHours: (data.opening_hours as string | null) ?? null,
      styles,
      houseRules,
      timeline,
      requestable,
      studioSlug,
    },
    ownerUserId,
  };
}

/**
 * The public (anonymous) plane read: viewer-independent by construction.
 * Serve this body with the public cache headers and nothing else.
 */
export async function getPublicMapLocationDetail(
  id: string,
): Promise<MapLocationDetailShared | null> {
  const loaded = await loadDetail(id);
  return loaded?.detail ?? null;
}

/** The authed composition: the shared payload plus the viewer decoration. */
export async function getMapLocationDetail(
  id: string,
  userId: string,
): Promise<MapLocationDetail | null> {
  const [loaded, { data: watch }] = await Promise.all([
    loadDetail(id),
    serviceClient
      .from("watched_studios")
      .select("id")
      .eq("map_location_id", id)
      .eq("artist_user_id", userId)
      .maybeSingle(),
  ]);
  if (!loaded) return null;
  return {
    ...loaded.detail,
    watched: Boolean(watch),
    ownStudio: loaded.ownerUserId !== null && loaded.ownerUserId === userId,
  };
}
