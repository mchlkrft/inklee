import "server-only";
import { serviceClient } from "@/lib/supabase/service";
import { aggregateStudioStyles } from "@inklee/shared/studio-styles";
import { STYLE_SEED } from "@inklee/shared/map-directory";

// The server read-path for a studio's "styles represented" (map redesign Slice
// 3). Composes owner-declared specialties (studio_categories.style_key) with
// upcoming/active guest coverage (guest_spot_stays x artist_styles) through the
// pure aggregator, and resolves labels from the shared style vocabulary. Only
// published studios return data (drafts never leak, the getPublishedHouseRules
// posture); seeded/unclaimed pins have no styles at all.

const STYLE_LABEL = new Map(STYLE_SEED.map((s) => [s.key, s.label] as const));
const styleLabel = (key: string): string => STYLE_LABEL.get(key) ?? key;

export type StudioStyleChip = { key: string; label: string };
export type GuestStyleChip = StudioStyleChip & {
  count: number;
  showCount: boolean;
};
export type StudioStylesForDisplay = {
  specialties: StudioStyleChip[];
  guestStyles: GuestStyleChip[];
  isEmpty: boolean;
};

const EMPTY: StudioStylesForDisplay = {
  specialties: [],
  guestStyles: [],
  isEmpty: true,
};

export async function getStudioStyles(
  studioProfileId: string,
): Promise<StudioStylesForDisplay> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("publication_status")
    .eq("id", studioProfileId)
    .maybeSingle();
  if (studio?.publication_status !== "published") return EMPTY;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: cats }, { data: stays }] = await Promise.all([
    serviceClient
      .from("studio_categories")
      .select("style_key")
      .eq("studio_profile_id", studioProfileId)
      .not("style_key", "is", null),
    // Current + upcoming guests only: confirmed/active stays that have not
    // ended. Expired, cancelled and no-show stays never contribute coverage.
    serviceClient
      .from("guest_spot_stays")
      .select("artist_user_id")
      .eq("studio_profile_id", studioProfileId)
      .in("status", ["confirmed", "active"])
      .gte("ends_on", today),
  ]);

  const declaredStyleKeys = (cats ?? [])
    .map((c) => c.style_key as string | null)
    .filter((k): k is string => Boolean(k));

  // Count coverage per DISTINCT guest artist, not per stay (one artist with two
  // upcoming stays is still one guest).
  const artistIds = [
    ...new Set((stays ?? []).map((s) => s.artist_user_id as string)),
  ];

  let guestArtistStyleKeys: string[][] = [];
  if (artistIds.length > 0) {
    const { data: styleRows } = await serviceClient
      .from("artist_styles")
      .select("artist_user_id, style_key")
      .in("artist_user_id", artistIds);
    const byArtist = new Map<string, string[]>();
    for (const row of styleRows ?? []) {
      const a = row.artist_user_id as string;
      const list = byArtist.get(a) ?? [];
      list.push(row.style_key as string);
      byArtist.set(a, list);
    }
    // One entry per guest artist who lists at least one style; a guest with no
    // declared styles contributes nothing rather than a phantom entry.
    guestArtistStyleKeys = artistIds
      .map((a) => byArtist.get(a) ?? [])
      .filter((list) => list.length > 0);
  }

  const agg = aggregateStudioStyles({
    declaredStyleKeys,
    guestArtistStyleKeys,
  });
  return {
    specialties: agg.specialties.map((k) => ({ key: k, label: styleLabel(k) })),
    guestStyles: agg.guestStyles.map((g) => ({
      key: g.styleKey,
      label: styleLabel(g.styleKey),
      count: g.count,
      showCount: g.showCount,
    })),
    isEmpty: agg.isEmpty,
  };
}
