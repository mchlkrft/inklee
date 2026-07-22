// One honest "styles represented" model for a studio (map redesign Slice 3).
//
// Composes the two style edges that ACTUALLY exist into a transparent
// breakdown that never implies every artist at a studio works in every style:
//   - owner-DECLARED studio specialties (studio_categories.style_key), and
//   - GUEST coverage (guest_spot_stays x artist_styles).
//
// Resident coverage is deliberately absent: no residency roster exists (founder
// deferral 2026-07-22), so we never fabricate "resident styles". Seeded pins
// have neither declared nor guest styles, so they render nothing rather than a
// misleading "no styles" state. Pure and platform-neutral (web + mobile).

import { MIN_ANON_ARTIST_COUNT } from "./map-directory";

export type GuestStyleCoverage = {
  styleKey: string;
  /** Distinct upcoming/active guest artists whose profile lists this style. */
  count: number;
  /**
   * Whether the count is safe to display (>= the anonymity floor). Below the
   * floor the UI shows "guest artist visiting" with no number, so a small
   * count can never single an artist out.
   */
  showCount: boolean;
};

export type StudioStyles = {
  /** Owner-declared studio specialties (no per-artist count). Order preserved. */
  specialties: string[];
  /** Styles brought by upcoming/active guest artists, most-covered first. */
  guestStyles: GuestStyleCoverage[];
  /** True when there is nothing honest to show (the typical unclaimed seed). */
  isEmpty: boolean;
};

export type StudioStylesInput = {
  /** studio_categories rows carrying a style_key (kind = 'standard'). */
  declaredStyleKeys: readonly string[];
  /**
   * One entry per active/upcoming guest artist: the style keys on their
   * profile (artist_styles). The CALLER must have already dropped expired,
   * cancelled and no-show stays; this function trusts that every entry is a
   * currently-relevant guest.
   */
  guestArtistStyleKeys: readonly (readonly string[])[];
  /** Anonymity floor for guest counts; defaults to MIN_ANON_ARTIST_COUNT. */
  floor?: number;
};

/**
 * Aggregate a studio's declared specialties and guest-artist style coverage.
 * Declared specialties are listed once each (order preserved); guest styles are
 * counted by DISTINCT guest artist (a guest listing a style twice counts once)
 * and floored for anonymity. A style may appear in both groups; the UI keeps
 * them in separate, clearly-labelled sub-sections.
 */
export function aggregateStudioStyles(input: StudioStylesInput): StudioStyles {
  const floor = input.floor ?? MIN_ANON_ARTIST_COUNT;

  const seenSpecialty = new Set<string>();
  const specialties: string[] = [];
  for (const key of input.declaredStyleKeys) {
    if (!key || seenSpecialty.has(key)) continue;
    seenSpecialty.add(key);
    specialties.push(key);
  }

  const guestCounts = new Map<string, number>();
  for (const styleKeys of input.guestArtistStyleKeys) {
    const distinct = new Set(styleKeys.filter(Boolean));
    for (const key of distinct) {
      guestCounts.set(key, (guestCounts.get(key) ?? 0) + 1);
    }
  }
  const guestStyles: GuestStyleCoverage[] = [...guestCounts.entries()]
    .map(([styleKey, count]) => ({
      styleKey,
      count,
      showCount: count >= floor,
    }))
    .sort((a, b) => b.count - a.count || a.styleKey.localeCompare(b.styleKey));

  return {
    specialties,
    guestStyles,
    isEmpty: specialties.length === 0 && guestStyles.length === 0,
  };
}
