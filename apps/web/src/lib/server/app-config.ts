import {
  parseDisabledCapabilitiesList,
  type Capability,
  type MobileAppConfig,
} from "@inklee/shared/app-config";
import { isUpdateRequired } from "@inklee/shared/app-version";
import type { MobilePlatform } from "@inklee/shared/app-version";

// Server side of the app-config plane (docs/architecture/remote-config-plan.md
// §8, §10.3). Source of truth is env (same operational muscle memory as the
// min-version kill-switch: set in Vercel, redeploy):
//
//   MOBILE_MIN_VERSION[_ANDROID|_IOS] + MOBILE_UPDATE_URL  — hard update floor
//   MOBILE_RECOMMENDED_VERSION                             — soft update nudge
//   DISABLED_CAPABILITIES                                  — comma-separated
//     capability names currently paused (e.g. "deposits,instagram_import").
//     Applies PLATFORM-WIDE (web actions AND mobile routes) — the client-side
//     copy only hides entry points; THIS is the authoritative switch.
//
// Everything here is FAIL-OPEN: unset env disables nothing and blocks nobody.

export function getDisabledCapabilities(): string[] {
  return parseDisabledCapabilitiesList(process.env.DISABLED_CAPABILITIES);
}

/** The authoritative capability pause check — call this in the server core /
 *  route that performs the capability, never only in UI. */
export function isCapabilityDisabled(capability: Capability): boolean {
  return getDisabledCapabilities().includes(capability);
}

/** Minimum supported version for a platform (min-version kill-switch env). */
export function resolveMinVersion(platform: MobilePlatform): string {
  const perPlatform =
    platform === "ios"
      ? process.env.MOBILE_MIN_VERSION_IOS
      : process.env.MOBILE_MIN_VERSION_ANDROID;
  return perPlatform || process.env.MOBILE_MIN_VERSION || "0.0.0";
}

/** Build the GET /api/mobile/config payload for a requesting build. Also the
 *  single implementation behind the legacy /api/mobile/min-version fields, so
 *  the two endpoints can never disagree. */
export function buildMobileAppConfig(
  platform: MobilePlatform,
  version: string,
): MobileAppConfig {
  const minVersion = resolveMinVersion(platform);
  return {
    minVersion,
    updateRequired: isUpdateRequired(version, minVersion),
    updateUrl: process.env.MOBILE_UPDATE_URL || null,
    recommendedVersion: process.env.MOBILE_RECOMMENDED_VERSION || null,
    disabledCapabilities: getDisabledCapabilities(),
  };
}
