import {
  canAccess,
  limitFor,
  withinLimit,
  type AccountOverrides,
  type EntitlementLimit,
} from "@/lib/entitlements";
import { isCapabilityDisabled } from "./app-config";

// Composed entitlement gates (BM-2.0 Stage 2), mirroring getDepositCollection so
// web and mobile enforce the SAME truth (the deposits lesson: the two surfaces
// drifted when each checked a different subset of factors). Each pairs the
// dark-launch kill switch (isCapabilityDisabled, fail-open) with the pure engine.
//
// Dark-launched: with the capability parked in DISABLED_CAPABILITIES, every gate
// below reverts to today's pre-enforcement behaviour (its coherent fallback), so
// the whole slice ships inert until the founder removes the name from the env.
//
// SHAPE MATTERS. A GRANT (branding footer removal, a NEW Plus perk) uses
// `!disabled && canAccess`. A RESTRICTION of something everyone has today
// (template editing, advanced analytics, the numeric caps) must invert so that
// PAUSING reverts to permissive: `disabled || canAccess`, and for a cap the
// BLOCK is guarded, never the allow.

/** GRANT: true => remove the public "made with Inklee" footer (a Plus perk).
 *  Paused => false => footer shown for everyone (today's behaviour). */
export function brandingRemoved(overrides: AccountOverrides): boolean {
  return !isCapabilityDisabled("branding") && canAccess(overrides, "branding");
}

/** GRANT (like branding): true => the artist gets the CUSTOM appearance layer
 *  (typography, button treatment, per-surface overrides, non-preset accents).
 *  Paused => everyone renders the Free appearance, which is exactly today's
 *  behaviour, so pausing is visually inert. Free artists keep their preset
 *  cover color, cover image and theme either way. */
export function appearanceCustomAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("appearance_custom") &&
    canAccess(overrides, "appearance_custom")
  );
}

/** GRANT: true => the artist gets the RICH CONTENT blocks on the Inklee Hub
 *  (image galleries today; the home for future rich sections such as video or
 *  testimonials). Split off `appearance_custom` (founder ruling FD1,
 *  2026-08-01, SUPERSEDES D1): a gallery is CONTENT, not a styling choice, and
 *  `appearance_custom` stays scoped to colors/fonts/templates/styling only.
 *  Paused => no rich content blocks for anyone, which is exactly today's
 *  look before this key existed. Free artists keep every other Hub block
 *  (headline, text, link, and the free feature blocks) either way. */
export function richContentBlocksAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("rich_content_blocks") &&
    canAccess(overrides, "rich_content_blocks")
  );
}

/** GRANT: true => booking-form questions may carry show/hide conditions.
 *  Paused => false => conditions are IGNORED and every question shows, which
 *  is the downgrade behaviour the capability registry specifies: a condition
 *  is never destroyed, it just stops hiding anything. That direction is the
 *  safe one, because the alternative (honouring conditions for an artist who
 *  is no longer entitled) would keep questions hidden from their clients. */
export function conditionalQuestionsAllowed(
  overrides: AccountOverrides,
): boolean {
  return (
    !isCapabilityDisabled("form_conditional") &&
    canAccess(overrides, "form_conditional")
  );
}

/** GRANT: true => the non-visual booking-form customization (custom
 *  confirmation page, custom URL slug). The VISUAL layer is `appearance_custom`
 *  and is deliberately not duplicated here. Paused => the default confirmation
 *  page for everyone, which is exactly today's behaviour. */
export function formCustomAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("form_custom") && canAccess(overrides, "form_custom")
  );
}

/** GRANT: true => large-project mode. Gates the PUBLIC intake at
 *  /{slug}/project (which 404s otherwise, so an un-entitled artist's page has
 *  no half-working sub-path) and the creation of new project records.
 *
 *  It deliberately does NOT gate READING existing projects: a downgrade must
 *  never hide an artist's own long-term records, some of which have live
 *  bookings attached. Same principle as email templates, which keep sending
 *  after editing is gated. */
export function largeProjectsAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("large_projects") &&
    canAccess(overrides, "large_projects")
  );
}

/** GRANT: true => the artist may create and run discount codes (Plus build
 *  P5). Paused => codes stop APPLYING at checkout and no new ones can be
 *  created, but existing rows are kept: a code is a promise an artist made
 *  publicly, and deleting it would be worse than pausing it. */
export function goodsDiscountsAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("goods_discounts") &&
    canAccess(overrides, "goods_discounts")
  );
}

/** GRANT: true => the artist may SET a drop time, a preorder flag or a
 *  low-stock threshold (Plus build P5c).
 *
 *  Deliberately gates the WRITE only, never the read. An existing drop date is
 *  always honoured, including for an artist who downgrades, because the other
 *  direction would put a limited piece on sale before its announced time. That
 *  is the opposite of the conditional-questions gate, where ignoring the rule
 *  shows MORE and is therefore the safe direction: here, ignoring the rule
 *  sells something early, which is the harm the feature exists to prevent. */
export function goodsSchedulingAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("goods_scheduling") &&
    canAccess(overrides, "goods_scheduling")
  );
}

/** GRANT: true => the artist may create and arrange shop collections.
 *  Paused => collections cannot be edited and the public shop renders ONE
 *  ungrouped list, which is exactly how it looks today. Existing collection
 *  rows and their product assignments are kept, so re-entitling restores the
 *  arrangement rather than asking the artist to rebuild it. */
export function goodsCollectionsAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("goods_collections") &&
    canAccess(overrides, "goods_collections")
  );
}

/** GRANT: true => the artist may create and manage product bundles (a named
 *  group of products sold at one set price). Paused => no bundle edits and the
 *  public shop shows no bundle offers; existing bundle rows and their items are
 *  kept, so re-entitling restores the offer rather than asking the artist to
 *  rebuild it (same posture as collections). The PAYABLE checkout for a bundle
 *  is a separate slice; this gates the entity + display. */
export function goodsBundlesAllowed(overrides: AccountOverrides): boolean {
  return (
    !isCapabilityDisabled("goods_bundles") &&
    canAccess(overrides, "goods_bundles")
  );
}

/** RESTRICTION: true => the artist may EDIT custom email-template bodies.
 *  Paused => true for everyone. Existing bodies always keep SENDING regardless;
 *  only editing is gated. */
export function canEditTemplates(overrides: AccountOverrides): boolean {
  return (
    isCapabilityDisabled("custom_templates") ||
    canAccess(overrides, "custom_templates")
  );
}

/** RESTRICTION (gate-for-all, no grandfather): true => advanced analytics.
 *  Paused => true for everyone. */
export function canSeeAdvancedAnalytics(overrides: AccountOverrides): boolean {
  return isCapabilityDisabled("analytics") || canAccess(overrides, "analytics");
}

export type CapState = {
  /** True => block creating a NEW item (at or over the cap while enforced). */
  blocked: boolean;
  /** The resolved cap (null = unlimited), for the upgrade message. */
  cap: number | null;
};

/** Numeric cap gate (block-new, keep-existing). Pass the CURRENT count (before
 *  the new insert). Paused => never blocked (today's unlimited behaviour). The
 *  BLOCK is guarded by the kill switch, not the allow, so a pause can never
 *  block everyone. */
export function capState(
  overrides: AccountOverrides,
  key: EntitlementLimit,
  currentCount: number,
): CapState {
  const cap = limitFor(overrides, key);
  const blocked =
    !isCapabilityDisabled("entitlement_caps") &&
    !withinLimit(overrides, key, currentCount);
  return { blocked, cap };
}
