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
