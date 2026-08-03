// Surface-specific CONTENT configuration (founder ruling FD10, 2026-08-01,
// CONFIRMS S1/S6 and closes the per-surface-theming question forever).
//
// Product principle, verbatim from the ruling: "One visual identity with
// surface-specific content configuration." The one shared appearance system
// (appearance.ts) stays the ONLY styling layer — colors, fonts, templates,
// buttons — across every public surface; that question is closed, not
// deferred. This module adds a second, independent layer on top of it:
// CONTENT an artist may set per surface (a hero image, a short intro line,
// and which collections to feature). It never touches theme/font/accent.
//
// Content vs styling is exactly the split founder ruling FD1 already drew
// between `appearance_custom` (styling only) and `rich_content_blocks`
// (content: image galleries today, "the home for future rich sections" per
// FD1's own wording). A hero image or an intro line is CONTENT, not a
// styling choice, so this rides `rich_content_blocks` — see
// apps/web/src/lib/server/surface-content.ts and surface-content-write.ts
// for where that gate is enforced (this module is pure and has no
// entitlement or database access, same discipline as appearance.ts and
// bio-page.ts).
//
// SCOPE, precisely — do not widen without a renderer to prove it. The shared
// appearance system's `AppearanceSurface` (appearance.ts) enumerates FIVE
// surfaces: hub, bookingForm, largeProject, shop, guestSpots. This module
// covers only "shop":
//   - "hub" already has its own, richer content system — the bio_page block
//     list (headline/text/featured_collection/image_gallery, bio-page.ts).
//     Duplicating that here would be a second, competing content model for
//     the same page.
//   - "bookingForm" and "largeProject" are out of this slice's scope per the
//     ruling ("targets the goods/guest-spot family in practice").
//   - "guestSpots" has NO renderer anywhere in the app (grepped 2026-08-01:
//     `surfaceAppearance(...,"guestSpots")` has zero call sites outside
//     tests). The trip content that exists today — the booking page's
//     TravelCard popover and the Hub's guest_spots feature block — lives
//     INSIDE the bookingForm and hub surfaces, not on an independent
//     "guestSpots" page. Building content config for a surface nothing
//     renders would be inert past the parser and untestable end to end, so
//     it is deliberately left out rather than shipped unreachable.
//
// "shop" covers BOTH places goods content renders: the standalone shop
// checkout page (/[slug]/shop/checkout, resolves the "shop" appearance
// surface per S6) and the booking-page shop teaser (ShopTeaser, embedded in
// the "bookingForm" surface). The teaser is a compact preview of the same
// shop, not an independent content surface, so one artist-authored record
// covers both places it renders — an artist should not have to enter the
// same intro line twice for what is, to them, one shop.
import { sanitizeHostedPublicImageUrl } from "./bio-page";

export const SURFACE_CONTENT_SURFACES = ["shop"] as const;
export type SurfaceContentSurface = (typeof SURFACE_CONTENT_SURFACES)[number];

export function isSurfaceContentSurface(
  v: unknown,
): v is SurfaceContentSurface {
  return (
    typeof v === "string" &&
    (SURFACE_CONTENT_SURFACES as readonly string[]).includes(v)
  );
}

export const MAX_INTRO_TEXT = 280;
/** No cap on collections generally (collections.ts), but a surface's
 *  FEATURED set is a promoted highlight, not the artist's whole catalogue —
 *  an unbounded "featured" list is not featuring anything. */
export const MAX_FEATURED_COLLECTIONS = 6;

export type SurfaceContent = {
  /** Inklee-hosted hero image for this surface, or null for none. Same trust
   *  boundary as a Hub gallery image had before 0151 (founder ruling FD4,
   *  2026-08-01): never an arbitrary external URL, always the public `logos`
   *  bucket on a supabase.co host. Validated by
   *  bio-page.ts's `sanitizeHostedPublicImageUrl` rather than a second copy of
   *  that check, so the gates cannot quietly drift (the HUB-GAL-006 lesson).
   *
   *  NO LONGER the same gate as a gallery image. Migration 0151 moved gallery
   *  objects into a private bucket behind signed URLs for LO-5 DPIA R4; hero
   *  media did NOT move, because it is shop branding rather than one of the
   *  DPIA's enumerated processing activities, and no signing path exists for
   *  it. Whether it SHOULD move is an open question recorded against R4, not
   *  something this field decides. */
  heroMediaUrl: string | null;
  /** A short intro line shown above this surface's content. */
  introText: string | null;
  /** Ordered, deduped product_collections ids to promote on this surface.
   *  Holds the reference only, exactly like the Hub's featured_collection
   *  block (bio-page.ts): name/products/order are read live at render time,
   *  so renaming or rearranging a collection needs no re-save here. Whether
   *  an id still resolves to a live, visible collection is deliberately NOT
   *  checked in this pure parser — the renderer drops what it cannot read,
   *  the same discipline bio-page.ts documents for its own reference block. */
  featuredCollectionIds: string[];
};

export const DEFAULT_SURFACE_CONTENT: SurfaceContent = {
  heroMediaUrl: null,
  introText: null,
  featuredCollectionIds: [],
};

export type SurfaceContentSettings = Partial<
  Record<SurfaceContentSurface, SurfaceContent>
>;

function isDefaultContent(c: SurfaceContent): boolean {
  return (
    c.heroMediaUrl === null &&
    c.introText === null &&
    c.featuredCollectionIds.length === 0
  );
}

/** Dedupe, trim, cap. Order preserved (first occurrence wins), matching the
 *  Hub block parser's own collection dedupe discipline. */
export function parseFeaturedCollectionIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (out.length >= MAX_FEATURED_COLLECTIONS) break;
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** A fresh, independently-mutable default. `{ ...DEFAULT_SURFACE_CONTENT }`
 *  alone is NOT enough: spreading only copies the top-level keys, so every
 *  caller would share the SAME `featuredCollectionIds` array reference as
 *  the module-level constant, and one caller pushing into "their" copy would
 *  corrupt the default for everyone else's subsequent call. */
function freshDefault(): SurfaceContent {
  return { ...DEFAULT_SURFACE_CONTENT, featuredCollectionIds: [] };
}

function parseSurfaceContentEntry(raw: unknown): SurfaceContent {
  if (!raw || typeof raw !== "object") return freshDefault();
  const o = raw as Record<string, unknown>;
  return {
    // Delegates to bio-page.ts's sanitizeHostedPublicImageUrl rather than
    // re-implementing the supabase.co / logos-bucket check, per the FD4
    // posture this module's header documents: one gate, reused, cannot
    // drift into a second, looser copy (the HUB-GAL-006 lesson).
    //
    // 0151 RENAMED the function this calls WITHOUT changing its behaviour.
    // Hero media stays in the PUBLIC logos bucket: it is shop branding, not
    // one of the LO-5 DPIA's processing activities, and it has no signing
    // path. Gallery images moved to a private bucket and took the old name
    // with them, so continuing to call the gallery gate here would have
    // rejected every existing hero image. See sanitizeHostedPublicImageUrl.
    heroMediaUrl: sanitizeHostedPublicImageUrl(o.heroMediaUrl),
    introText:
      typeof o.introText === "string" && o.introText.trim()
        ? o.introText.trim().slice(0, MAX_INTRO_TEXT)
        : null,
    featuredCollectionIds: parseFeaturedCollectionIds(o.featuredCollectionIds),
  };
}

/**
 * Parse `profiles.settings.surface_content` (pass the FRAGMENT, not the
 * whole settings object — same calling convention as parseBioPageSettings,
 * since unlike appearance.ts there is no legacy sibling field to read
 * through). Pure, hostile-input tolerant: never throws, and an unknown
 * surface key or an unparseable entry is dropped rather than rejecting the
 * whole object.
 *
 * A surface entry that parses to every field empty is OMITTED from the
 * result rather than stored as an explicit "all default" record — "no
 * content configured for this surface" and "content configured but every
 * field is empty" render identically (resolveSurfaceContent falls back to
 * DEFAULT_SURFACE_CONTENT for a missing key), so keeping the shorter,
 * canonical form avoids two on-disk shapes for one outcome.
 */
export function parseSurfaceContentSettings(
  raw: unknown,
): SurfaceContentSettings {
  const container =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out: SurfaceContentSettings = {};
  for (const surface of SURFACE_CONTENT_SURFACES) {
    if (!(surface in container)) continue;
    const entry = parseSurfaceContentEntry(container[surface]);
    if (isDefaultContent(entry)) continue;
    out[surface] = entry;
  }
  return out;
}

/** The effective content for one surface: the stored config, or the
 *  all-empty default when nothing has been set. Entitlement is deliberately
 *  NOT checked here (pure parser, no database) — the server-side resolver
 *  (surface-content.ts) applies the `rich_content_blocks` gate at RENDER, so
 *  a plan downgrade hides content without this function ever deleting the
 *  artist's stored configuration (same posture as bio-page.ts's gallery
 *  blocks, decision D2). */
export function resolveSurfaceContent(
  settings: SurfaceContentSettings,
  surface: SurfaceContentSurface,
): SurfaceContent {
  return settings[surface] ?? freshDefault();
}
