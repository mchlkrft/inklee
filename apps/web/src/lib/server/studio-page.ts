import "server-only";
import { cache } from "react";
import { serviceClient } from "@/lib/supabase/service";
import { publicMapEnabled } from "@/lib/map-features";
import {
  computeStudioCompleteness,
  MIN_STUDIO_CATEGORIES,
  STUDIO_STANDARD_CATEGORY_LABELS,
  type StudioStandardCategory,
} from "@inklee/shared/studio-profile";
import {
  studioSlugCandidates,
  studioPageIndexability,
  studioPageRenderable,
  type StudioIndexability,
} from "@inklee/shared/studio-page";
import {
  getStudioStyles,
  type StudioStylesForDisplay,
} from "@/lib/server/studio-styles";
import { getPublishedHouseRules } from "@/lib/server/studios";
import {
  getStudioGuestTimeline,
  type StudioTimeline,
} from "@/lib/server/guest-spots";

// The public studio entity page read model (go-live plan S2b, founder D1).
// ONE source for the page route and the sitemap segment, so a studio can
// never be listed in the sitemap under rules the page itself would not honor.

/** A read failed rather than finding nothing. Callers must NOT 404 on this. */
export class StudioPageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StudioPageReadError";
  }
}

/**
 * Media URLs on this page must be STABLE: signed URLs expire, and an
 * indexable page must not reference a URL that 404s an hour later. The
 * `studio-media` bucket stays private (no policy change); the proxy route
 * re-checks the gate on every request and streams the bytes.
 * If media volume ever makes proxy bandwidth a concern, the alternative is a
 * published public-bucket copy written at publish time.
 */
export function studioMediaProxyUrl(
  studioId: string,
  storagePath: string,
): string | null {
  // Paths are stored as "{studioId}/{file}"; anything else is not ours.
  const prefix = `${studioId}/`;
  if (!storagePath.startsWith(prefix)) return null;
  const file = storagePath.slice(prefix.length);
  if (!file || file.includes("/") || file.includes("..")) return null;
  return `/api/studio-media/${studioId}/${encodeURIComponent(file)}`;
}

export type PublicStudioPage = {
  studioId: string;
  slug: string;
  name: string;
  description: string | null;
  vibe: string | null;
  city: string | null;
  country: string | null;
  /** Street address only when the owner shows it AND the category allows it. */
  streetAddress: string | null;
  /** Display coordinates; null unless the exact address is shown. */
  geo: { lat: number; lng: number } | null;
  website: string | null;
  instagram: string | null;
  guestSpotStatus: string;
  mapLocationId: string;
  logoUrl: string | null;
  photoUrls: string[];
  categories: Array<{ kind: string; label: string }>;
  styles: StudioStylesForDisplay | null;
  houseRules: Array<{ key: string; content: string }>;
  timeline: StudioTimeline | null;
  lastConfirmedAt: string | null;
  indexability: StudioIndexability;
};

const STUDIO_SELECT =
  "id, slug, name, description, vibe, address_visibility, guest_spot_status, publication_status, logo_path, show_guest_timeline";

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

async function loadStudioPage(slug: string): Promise<PublicStudioPage | null> {
  const { data: studio, error: studioErr } = await serviceClient
    .from("studio_profiles")
    .select(STUDIO_SELECT)
    .eq("slug", slug)
    .maybeSingle();
  // A transient failure must never masquerade as "no such studio": a live,
  // indexed URL answering 404 is how pages get dropped from the index.
  if (studioErr) throw new StudioPageReadError(studioErr.message);
  if (!studio) return null;

  const studioId = studio.id as string;
  // Address, city, country and the display point come from map_locations,
  // the MODERATED copy. studio_profiles carries an owner-editable duplicate
  // that no admin action can scrub, so reading it here would put a takedown
  // out of reach of the moderation queue.
  const { data: location, error: locationErr } = await serviceClient
    .from("map_locations")
    .select(
      "id, category, claim_status, moderation_status, possibly_closed, last_confirmed_at, address, city, country, display_latitude, display_longitude, website_url, instagram_handle",
    )
    .eq("studio_profile_id", studioId)
    .maybeSingle();
  if (locationErr) throw new StudioPageReadError(locationErr.message);
  if (!location) return null;

  const renderable = studioPageRenderable({
    claimStatus: location.claim_status as string,
    moderationStatus: location.moderation_status as string,
    publicationStatus: studio.publication_status as string,
  });
  if (!renderable) return null;

  const locationId = location.id as string;
  const [
    { data: categoryRows, error: categoryErr },
    { data: photoRows, error: photoErr },
    { data: duplicateRow, error: duplicateErr },
    styles,
    houseRules,
  ] = await Promise.all([
    serviceClient
      .from("studio_categories")
      .select("kind, standard_key, custom_label")
      .eq("studio_profile_id", studioId),
    serviceClient
      .from("studio_photos")
      .select("storage_path, position")
      .eq("studio_profile_id", studioId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    serviceClient
      .from("map_duplicate_suggestions")
      .select("id")
      .eq("status", "open")
      .or(`location_a.eq.${locationId},location_b.eq.${locationId}`)
      .limit(1)
      .maybeSingle(),
    getStudioStyles(studioId),
    getPublishedHouseRules(studioId),
  ]);
  if (categoryErr) throw new StudioPageReadError(categoryErr.message);
  if (photoErr) throw new StudioPageReadError(photoErr.message);
  if (duplicateErr) throw new StudioPageReadError(duplicateErr.message);

  const timeline = (studio.show_guest_timeline as boolean)
    ? await getStudioGuestTimeline(studioId)
    : null;

  const logoPath = (studio.logo_path as string | null) ?? null;
  const photos = (photoRows ?? []).map((p) => p.storage_path as string);
  const description = ((studio.description as string | null) ?? "").trim();
  const city = (location.city as string | null) ?? null;
  const country = (location.country as string | null) ?? null;
  const address = ((location.address as string | null) ?? "").trim();

  // Two independent gates on the street address and the point:
  //  - the owner's own choice (address_visibility), and
  //  - the locked scope rule that a private studio is never shown at its
  //    exact position. The claim path creates profiles at the column default
  //    ('exact') without ever asking, so the category rule must hold here too
  //    rather than trusting that default.
  const isPrivateStudio = (location.category as string) === "private_studio";
  const showsExactAddress =
    (studio.address_visibility as string) === "exact" && !isPrivateStudio;

  const completeness = computeStudioCompleteness({
    hasLogo: Boolean(logoPath),
    photoCount: photos.length,
    hasDescription: description.length > 0,
    // Mirrors the publish gate exactly (trimmed, and an approximate-location
    // studio satisfies it without a street address).
    hasAddress:
      address.length > 0 || (studio.address_visibility as string) !== "exact",
    categoryCount: (categoryRows ?? []).length,
    hasVibe: Boolean((studio.vibe as string | null) ?? null),
    houseRuleCount: houseRules.length,
  });

  const indexability = studioPageIndexability({
    claimStatus: location.claim_status as string,
    moderationStatus: location.moderation_status as string,
    possiblyClosed: Boolean(location.possibly_closed),
    hasOpenDuplicate: Boolean(duplicateRow),
    publicationStatus: studio.publication_status as string,
    publishReady:
      completeness.publishReady &&
      (categoryRows ?? []).length >= MIN_STUDIO_CATEGORIES,
    hasDescription: description.length > 0,
    hasPlace: Boolean(city || country),
    publicSurfaceReady: publicMapEnabled(),
  });

  return {
    studioId,
    slug,
    name: studio.name as string,
    description: description.length > 0 ? description : null,
    vibe: (studio.vibe as string | null) ?? null,
    city,
    country,
    streetAddress: showsExactAddress && address.length > 0 ? address : null,
    // Geo only where the exact address is shown: an approximate or private
    // studio's display point is deliberately offset and must never be
    // published as the business location.
    geo:
      showsExactAddress &&
      typeof location.display_latitude === "number" &&
      typeof location.display_longitude === "number"
        ? {
            lat: location.display_latitude as number,
            lng: location.display_longitude as number,
          }
        : null,
    website: safeHttpUrl(location.website_url as string | null),
    instagram: (location.instagram_handle as string | null) ?? null,
    guestSpotStatus: studio.guest_spot_status as string,
    mapLocationId: locationId,
    logoUrl: logoPath ? studioMediaProxyUrl(studioId, logoPath) : null,
    photoUrls: photos
      .map((p) => studioMediaProxyUrl(studioId, p))
      .filter((v): v is string => v !== null),
    // Style categories render in their own "Styles represented" section
    // (getStudioStyles resolves their labels), so this list carries only the
    // standard types and the owner's custom labels; a raw enum key never
    // reaches the page.
    categories: (categoryRows ?? [])
      .filter((row) => (row.kind as string) !== "style")
      .map((row) => {
        const standard = row.standard_key as StudioStandardCategory | null;
        return {
          kind: row.kind as string,
          label:
            (row.custom_label as string | null) ??
            (standard ? STUDIO_STANDARD_CATEGORY_LABELS[standard] : null) ??
            "",
        };
      })
      .filter((c) => c.label.length > 0),
    styles,
    houseRules,
    timeline,
    lastConfirmedAt: (location.last_confirmed_at as string | null) ?? null,
    indexability,
  };
}

/**
 * Full page read for /studios/[slug]. Returns null when no studio may render
 * under this slug (unknown, unclaimed, unpublished, or not approved) so the
 * route 404s instead of serving a thin page; THROWS on a read failure so a
 * blip never turns a live URL into a 404.
 *
 * Memoized per request: `generateMetadata` and the component body both need
 * it, and React's cache keeps that to one read.
 */
export const getPublicStudioPage = cache(loadStudioPage);

/**
 * Slugs of every studio whose page is currently INDEXABLE. The sitemap
 * segment is built from this and nothing else, so a page that does not pass
 * the gate can never be submitted.
 *
 * Deliberately a narrow set-based query rather than a per-studio replay of
 * the page read model: the sitemap runs on an ISR regeneration path, and an
 * N+1 over the full read model would time out long before the row cap. The
 * cheap conditions are filtered in SQL; the two that need per-studio work
 * (the publish minimums and the description) are checked from batched reads.
 */
export async function listIndexableStudioSlugs(): Promise<string[]> {
  if (!publicMapEnabled()) return [];

  // Claimed + approved + not stale, joined to published studios with a slug.
  const { data: rows, error } = await serviceClient
    .from("map_locations")
    .select(
      "id, city, country, studio_profiles!inner(id, slug, description, logo_path, address_visibility, publication_status)",
    )
    .eq("claim_status", "claimed")
    .eq("moderation_status", "approved")
    .eq("possibly_closed", false)
    .eq("studio_profiles.publication_status", "published")
    .not("studio_profiles.slug", "is", null)
    .order("id", { ascending: true })
    .limit(1000);
  if (error) throw new StudioPageReadError(error.message);

  type JoinedRow = {
    id: string;
    city: string | null;
    country: string | null;
    studio_profiles: {
      id: string;
      slug: string | null;
      description: string | null;
      logo_path: string | null;
      address_visibility: string;
    };
  };
  const candidates = (rows ?? []) as unknown as JoinedRow[];
  const eligible = candidates.filter(
    (r) =>
      Boolean(r.studio_profiles.slug) &&
      (r.studio_profiles.description ?? "").trim().length > 0 &&
      Boolean(r.studio_profiles.logo_path) &&
      Boolean(r.city || r.country),
  );
  if (eligible.length === 0) return [];

  const studioIds = eligible.map((r) => r.studio_profiles.id);
  const locationIds = eligible.map((r) => r.id);
  const [
    { data: photoRows, error: photoErr },
    { data: categoryRows, error: categoryErr },
    { data: duplicateRows, error: duplicateErr },
  ] = await Promise.all([
    serviceClient
      .from("studio_photos")
      .select("studio_profile_id")
      .in("studio_profile_id", studioIds),
    serviceClient
      .from("studio_categories")
      .select("studio_profile_id")
      .in("studio_profile_id", studioIds),
    serviceClient
      .from("map_duplicate_suggestions")
      .select("location_a, location_b")
      .eq("status", "open"),
  ]);
  if (photoErr) throw new StudioPageReadError(photoErr.message);
  if (categoryErr) throw new StudioPageReadError(categoryErr.message);
  if (duplicateErr) throw new StudioPageReadError(duplicateErr.message);

  const count = (
    rows: Array<{ studio_profile_id: string }> | null,
  ): Map<string, number> => {
    const map = new Map<string, number>();
    for (const row of rows ?? []) {
      const key = row.studio_profile_id;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const photoCounts = count(photoRows as Array<{ studio_profile_id: string }>);
  const categoryCounts = count(
    categoryRows as Array<{ studio_profile_id: string }>,
  );
  const duplicated = new Set<string>();
  for (const row of duplicateRows ?? []) {
    duplicated.add(row.location_a as string);
    duplicated.add(row.location_b as string);
  }
  const locationById = new Set(locationIds);

  const out: string[] = [];
  for (const row of eligible) {
    const studio = row.studio_profiles;
    if (duplicated.has(row.id) && locationById.has(row.id)) continue;
    const completeness = computeStudioCompleteness({
      hasLogo: Boolean(studio.logo_path),
      photoCount: photoCounts.get(studio.id) ?? 0,
      hasDescription: (studio.description ?? "").trim().length > 0,
      // The join carries no address column; an exact-address studio that
      // cleared its address is caught by the page's own gate, and the
      // sitemap's job is to avoid listing anything the page would noindex.
      hasAddress: true,
      categoryCount: categoryCounts.get(studio.id) ?? 0,
      hasVibe: false,
      houseRuleCount: 0,
    });
    if (!completeness.publishReady) continue;
    if ((categoryCounts.get(studio.id) ?? 0) < MIN_STUDIO_CATEGORIES) continue;
    out.push(studio.slug as string);
  }
  return out;
}

/**
 * Mint the studio's permanent public slug. Called at first publish and at
 * claim approval.
 *
 * Stability rule (go-live plan S2b): a slug never changes once assigned, so a
 * page that has been indexable keeps its URL forever and no redirect table is
 * needed. A later studio rename keeps the original slug; the page's visible
 * name updates, its URL does not.
 */
export async function ensureStudioSlug(
  studioId: string,
): Promise<{ slug: string | null; error?: string }> {
  const { data: studio } = await serviceClient
    .from("studio_profiles")
    .select("id, slug, name, city")
    .eq("id", studioId)
    .maybeSingle();
  if (!studio) return { slug: null, error: "Studio not found." };
  const existing = (studio.slug as string | null) ?? null;
  if (existing) return { slug: existing };

  const candidates = studioSlugCandidates(
    studio.name as string,
    (studio.city as string | null) ?? null,
  );
  // Last resort when a name yields nothing usable (punctuation-only, or every
  // candidate taken): a stable id-derived slug, never a random one.
  candidates.push(`studio-${studioId.replace(/-/g, "").slice(0, 12)}`);

  for (const candidate of candidates) {
    const { data: taken } = await serviceClient
      .from("studio_profiles")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (taken) continue;
    // `.select()` so a zero-row result (another publish of THIS studio won the
    // race and set a different slug) is distinguishable from a real write.
    const { data: written, error } = await serviceClient
      .from("studio_profiles")
      .update({ slug: candidate, updated_at: new Date().toISOString() })
      .eq("id", studioId)
      .is("slug", null)
      .select("slug");
    if (!error && written && written.length > 0) {
      return { slug: written[0].slug as string };
    }
    // Either the unique index fired (another STUDIO took the candidate) or we
    // matched zero rows (this studio already has a slug). Re-read and settle.
    const { data: after } = await serviceClient
      .from("studio_profiles")
      .select("slug")
      .eq("id", studioId)
      .maybeSingle();
    const settled = (after?.slug as string | null) ?? null;
    if (settled) return { slug: settled };
  }
  return { slug: null, error: "Could not assign a public address." };
}
