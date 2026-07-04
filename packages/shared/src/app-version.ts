// Semver-lite comparison for the mobile min-version kill-switch (there is no
// OTA, so a bad money-path build must be recallable server-side). Parses
// "major.minor.patch"; a pre-release / build suffix is dropped ("1.2.3-beta.1"
// -> "1.2.3") and shorter strings zero-fill ("1.2" -> 1.2.0). Non-numeric or
// empty segments count as 0.
//
// The consumer (GET /api/mobile/min-version) is deliberately FAIL-OPEN: an
// unset minimum resolves to "0.0.0", so a missing/misconfigured env var never
// bricks every installed build. The switch only activates when a minimum is
// affirmatively set above a shipped build.

export type MobilePlatform = "android" | "ios";

/** Response of GET /api/mobile/min-version. */
export type MobileMinVersion = {
  /** Minimum supported app version for the requesting platform. */
  minVersion: string;
  /** True when the requesting build is strictly older than minVersion. */
  updateRequired: boolean;
  /** Where to send the user to update (store / APK page), or null. */
  updateUrl: string | null;
};

function parseVersion(v: string | null | undefined): [number, number, number] {
  const core = String(v ?? "").trim().split(/[-+]/)[0];
  const parts = core.split(".").map((p) => {
    const n = parseInt(p, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  });
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/** -1 if a < b, 0 if equal, 1 if a > b (by major.minor.patch). */
export function compareVersions(a: string, b: string): -1 | 0 | 1 {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

/** True when `current` is strictly older than `min`. */
export function isUpdateRequired(current: string, min: string): boolean {
  return compareVersions(current, min) < 0;
}
