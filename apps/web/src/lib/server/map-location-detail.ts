import "server-only";
import { serviceClient } from "@/lib/supabase/service";
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

export type MapLocationDetail = {
  id: string;
  name: string;
  category: string;
  claimed: boolean;
  /** Seed pin nobody has claimed: its details are a snapshot, so we say so. */
  unverified: boolean;
  /** When an owner last confirmed the data (claim or edit); null for seeds. */
  lastConfirmedAt: string | null;
  /** An admin flagged this from a "closed"/"outdated" report; a soft warning. */
  possiblyClosed: boolean;
  signal: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  website: string | null;
  instagram: string | null;
  phone: string | null;
  openingHours: string | null;
  watched: boolean;
  styles: StudioStylesForDisplay | null;
  houseRules: { key: string; content: string }[];
  timeline: StudioTimeline | null;
  requestable: boolean;
  ownStudio: boolean;
};

export async function getMapLocationDetail(
  id: string,
  userId: string,
): Promise<MapLocationDetail | null> {
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

  const [{ data: watch }, signals] = await Promise.all([
    serviceClient
      .from("watched_studios")
      .select("id")
      .eq("map_location_id", id)
      .eq("artist_user_id", userId)
      .maybeSingle(),
    activeSignalsByLocation([id]),
  ]);

  let styles: StudioStylesForDisplay | null = null;
  let houseRules: { key: string; content: string }[] = [];
  let timeline: StudioTimeline | null = null;
  let requestable = false;
  let ownStudio = false;
  if (studioProfileId) {
    const { data: studio } = await serviceClient
      .from("studio_profiles")
      .select("owner_user_id, publication_status, guest_spot_status")
      .eq("id", studioProfileId)
      .maybeSingle();
    ownStudio = studio?.owner_user_id === userId;
    requestable =
      studio?.publication_status === "published" &&
      studio.guest_spot_status === "accepting";
    if (studio?.publication_status === "published") {
      [houseRules, timeline, styles] = await Promise.all([
        getPublishedHouseRules(studioProfileId),
        getStudioGuestTimeline(studioProfileId),
        getStudioStyles(studioProfileId),
      ]);
    }
  }

  return {
    id: data.id as string,
    name: data.name as string,
    category: data.category as string,
    claimed,
    unverified: Boolean(data.is_seed) && !claimed,
    lastConfirmedAt: (data.last_confirmed_at as string | null) ?? null,
    possiblyClosed: Boolean(data.possibly_closed),
    signal: signals.get(id) ?? null,
    address: (data.address as string | null) ?? null,
    city: (data.city as string | null) ?? null,
    country: (data.country as string | null) ?? null,
    website: safeHttpUrl(data.website_url as string | null),
    instagram: (data.instagram_handle as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    openingHours: (data.opening_hours as string | null) ?? null,
    watched: Boolean(watch),
    styles,
    houseRules,
    timeline,
    requestable,
    ownStudio,
  };
}
