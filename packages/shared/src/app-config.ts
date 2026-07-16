// The mobile app-config contract (docs/architecture/remote-config-plan.md §8).
//
// GET /api/mobile/config is the server-driven config plane for installed
// builds: the min-version kill-switch fields (same semantics as
// /api/mobile/min-version, which older builds keep calling), a soft-update
// nudge, and ONE grouped kill mechanism — `disabledCapabilities`, a list of
// capability names that are remotely paused.
//
// Design rules (mirror the min-version philosophy):
//  - FAIL-OPEN: a missing/malformed payload parses to DEFAULT_APP_CONFIG,
//    which disables nothing and blocks nobody. A config outage can never
//    degrade the fleet; the authoritative half of every kill lives
//    server-side regardless.
//  - Unknown capability names are ignored by consumers — that is how an old
//    build safely consumes config written for a newer one.
//  - Remote config is NEVER authorization. Client consumers may hide entry
//    points; the server enforces with its own copy of the same list.

import { isUpdateRequired } from "./app-version";

/** The capability registry (docs/architecture/capability-registry.md must stay
 *  in lockstep). Capability-level nouns only — never components, never
 *  negatives. */
export const CAPABILITIES = ["deposits", "instagram_import"] as const;
export type Capability = (typeof CAPABILITIES)[number];

export function isCapability(value: string): value is Capability {
  return (CAPABILITIES as readonly string[]).includes(value);
}

/** Response of GET /api/mobile/config (the `data` payload). */
export type MobileAppConfig = {
  /** Minimum supported app version for the requesting platform. */
  minVersion: string;
  /** True when the requesting build is strictly older than minVersion. */
  updateRequired: boolean;
  /** Where to send the user to update (store / APK page), or null. */
  updateUrl: string | null;
  /** Soft-update nudge: show a dismissible banner when the build is older
   *  than this. Null (unset) means no nudge. */
  recommendedVersion: string | null;
  /** Capability names currently paused platform-wide. Typed string[] (not
   *  Capability[]) on purpose: a NEWER server may list names this build
   *  doesn't know, and they must pass through harmlessly. */
  disabledCapabilities: string[];
};

export const DEFAULT_APP_CONFIG: MobileAppConfig = {
  minVersion: "0.0.0",
  updateRequired: false,
  updateUrl: null,
  recommendedVersion: null,
  disabledCapabilities: [],
};

/**
 * Tolerant parser: unknown keys dropped, wrong types coerced to the bundled
 * default, list entries validated per-entry. A malformed payload can only ever
 * produce defaults (nothing disabled, nobody blocked) — never a throw.
 */
export function parseAppConfig(raw: unknown): MobileAppConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ...DEFAULT_APP_CONFIG, disabledCapabilities: [] };
  }
  const r = raw as Record<string, unknown>;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
  return {
    minVersion: str(r.minVersion) ?? DEFAULT_APP_CONFIG.minVersion,
    updateRequired: r.updateRequired === true,
    updateUrl: str(r.updateUrl),
    recommendedVersion: str(r.recommendedVersion),
    disabledCapabilities: Array.isArray(r.disabledCapabilities)
      ? r.disabledCapabilities
          .map((v) => (typeof v === "string" ? v.trim() : ""))
          .filter((v) => v.length > 0)
      : [],
  };
}

/** True when the capability is NOT remotely paused. Unknown-to-this-build
 *  names in the list simply never match a known Capability — the safe-ignore
 *  path for old builds. */
export function isCapabilityEnabled(
  config: Pick<MobileAppConfig, "disabledCapabilities">,
  capability: Capability,
): boolean {
  return !config.disabledCapabilities.includes(capability);
}

/** Soft-update check: true when the build is strictly older than the
 *  recommended version. Null/unset recommendation never nudges. */
export function isUpdateRecommended(
  current: string,
  recommended: string | null,
): boolean {
  return recommended !== null && isUpdateRequired(current, recommended);
}

/**
 * Parse the server's MOBILE_DISABLED_CAPABILITIES env value (comma-separated,
 * e.g. "deposits, instagram_import"). Lowercased + trimmed; empties dropped.
 * Unknown names are KEPT (they may be a capability a newer build knows), so a
 * typo silently disables nothing — the fail-open direction, by design. The
 * exact registered names live in docs/architecture/capability-registry.md.
 */
export function parseDisabledCapabilitiesList(
  value: string | null | undefined,
): string[] {
  return String(value ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}
