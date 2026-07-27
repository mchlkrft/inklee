// The public studio entity page: slug minting and the indexability gate
// (go-live plan S2b, founder decision D1 2026-07-27 puts these pages in v1).
//
// Pure and platform-neutral so the page route, the sitemap segment, and the
// tests all agree on ONE definition of "may this studio have an indexable
// page". The conditions come verbatim from the ratified SEO strategy
// ("Public tattoo map and local studio discovery" -> claimed studio profiles);
// nothing here invents indexation policy.

import { RESERVED_SLUGS, SLUG_FORMAT_REGEX } from "./slug";

export const STUDIO_SLUG_MAX_LENGTH = 60;
const STUDIO_SLUG_MIN_LENGTH = 3;

/**
 * Kebab-case a studio name into a slug candidate: lowercase, accents folded,
 * everything non-alphanumeric collapsed to single dashes. Returns null when
 * nothing usable survives (a name of only punctuation or scripts we cannot
 * transliterate), in which case the caller falls back to a stable id-derived
 * slug rather than inventing letters.
 */
export function studioSlugify(input: string): string | null {
  const folded = input
    // NFKD splits an accented letter into base + combining mark. The marks
    // must be DELETED, not collapsed with the other non-alphanumerics below:
    // a mark in the middle of a word would otherwise become a dash
    // ("Größe" -> "gro-sse" instead of "grosse").
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ß/g, "ss")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (folded.length === 0) return null;
  // Must start with a letter (the shared slug format rule); a leading digit
  // gets a stable prefix rather than being dropped.
  const candidate = /^[a-z]/.test(folded) ? folded : `studio-${folded}`;
  const trimmed = candidate.slice(0, STUDIO_SLUG_MAX_LENGTH).replace(/-+$/, "");
  if (trimmed.length < STUDIO_SLUG_MIN_LENGTH) return null;
  return trimmed;
}

/** Format + reserved-word validity for a studio slug. */
export function isValidStudioSlug(slug: string): boolean {
  if (slug.length < STUDIO_SLUG_MIN_LENGTH) return false;
  if (slug.length > STUDIO_SLUG_MAX_LENGTH) return false;
  if (!SLUG_FORMAT_REGEX.test(slug)) return false;
  // Studio slugs live under /studios/<slug>, a different namespace from artist
  // slugs, but the reserved list is still the right guard: it holds route
  // segments and infrastructure names that must never become content URLs.
  return !RESERVED_SLUGS.has(slug);
}

/**
 * Ordered slug candidates for a studio, best first. The caller walks these
 * against the unique index and takes the first free one. City is the first
 * disambiguator (two "Black Needle" studios in different cities read
 * naturally), then a numeric suffix.
 */
export function studioSlugCandidates(
  name: string,
  city: string | null,
  maxNumericAttempts = 20,
): string[] {
  const base = studioSlugify(name);
  const out: string[] = [];
  const push = (value: string | null) => {
    if (!value) return;
    const capped = value.slice(0, STUDIO_SLUG_MAX_LENGTH).replace(/-+$/, "");
    if (isValidStudioSlug(capped) && !out.includes(capped)) out.push(capped);
  };
  push(base);
  const citySlug = city ? studioSlugify(city) : null;
  if (base && citySlug) push(`${base}-${citySlug}`);
  for (let n = 2; n <= maxNumericAttempts + 1; n++) {
    if (base) push(`${base}-${n}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The indexability gate.
//
// Eight conditions from the ratified SEO strategy. Two of them (owner-declared
// content only, and server-rendered unique HTML) are properties of the
// implementation rather than per-row facts, so the page asserts them by
// construction; the rest are checked per studio here. The strategy's
// "no unresolved hidden, removed, duplicate, or possibly-closed state" is
// three separate inputs below (moderation status covers hidden and removed).

export type StudioIndexabilityInput = {
  /** map_locations.claim_status */
  claimStatus: string;
  /** map_locations.moderation_status */
  moderationStatus: string;
  /** map_locations.possibly_closed */
  possiblyClosed: boolean;
  /** An open (undismissed) duplicate suggestion on this location. */
  hasOpenDuplicate: boolean;
  /** studio_profiles.publication_status */
  publicationStatus: string;
  /** The locked publish minimums, recomputed at read time. */
  publishReady: boolean;
  /** A unique, non-empty description is required for a crawlable page. */
  hasDescription: boolean;
  /** City or region must be present so the page is locatable. */
  hasPlace: boolean;
  /**
   * The public map surface is live (attribution page reachable, privacy
   * disclosures served). While the map is dark, nothing may be indexable.
   */
  publicSurfaceReady: boolean;
};

export type StudioIndexability = {
  indexable: boolean;
  /** Why not, for the admin/debug surface and the tests. Empty when indexable. */
  blockers: string[];
};

export function studioPageIndexability(
  input: StudioIndexabilityInput,
): StudioIndexability {
  const blockers: string[] = [];
  if (input.claimStatus !== "claimed") blockers.push("not_claimed");
  if (input.publicationStatus !== "published") blockers.push("not_published");
  if (input.moderationStatus !== "approved") blockers.push("not_approved");
  if (input.possiblyClosed) blockers.push("possibly_closed");
  if (input.hasOpenDuplicate) blockers.push("open_duplicate");
  if (!input.publishReady) blockers.push("publish_gate_incomplete");
  if (!input.hasDescription) blockers.push("no_description");
  if (!input.hasPlace) blockers.push("no_place");
  if (!input.publicSurfaceReady) blockers.push("public_surface_dark");
  return { indexable: blockers.length === 0, blockers };
}

/**
 * Whether the page may RENDER at all (as opposed to be indexed). A studio
 * page exists for claimed + published studios whose map entry is approved;
 * everything else 404s rather than serving a thin page. Deliberately narrower
 * than indexability: a gate-passing-but-stale studio still has a real page,
 * it just carries noindex.
 */
export function studioPageRenderable(input: {
  claimStatus: string;
  moderationStatus: string;
  publicationStatus: string;
}): boolean {
  return (
    input.claimStatus === "claimed" &&
    input.publicationStatus === "published" &&
    input.moderationStatus === "approved"
  );
}
