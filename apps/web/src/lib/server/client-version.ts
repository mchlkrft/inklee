import { compareVersions } from "@inklee/shared/app-version";

// Version negotiation for /api/mobile/* responses. The mobile client (0.2.0+)
// sends X-Inklee-App-Version / X-Inklee-Platform on every request; builds that
// predate the headers resolve to "0.0.0" — i.e. the OLDEST client — so a
// missing or malformed header always selects the most conservative emission.
//
// Policy (docs/architecture/remote-config-plan.md §12): new backend behavior is
// backward compatible by default; where a response would carry a value or
// shape an old build cannot render safely (a new enum value, changed money
// semantics), gate the emission with clientAtLeast and collapse or withhold it
// for older clients. Version conditions live HERE in code as reusable checks —
// never as one remote flag per app version.

export function clientAppVersion(req: Request): string {
  return req.headers.get("x-inklee-app-version")?.trim() || "0.0.0";
}

export function clientPlatform(req: Request): "android" | "ios" | "unknown" {
  const raw = req.headers.get("x-inklee-platform")?.trim().toLowerCase();
  return raw === "ios" ? "ios" : raw === "android" ? "android" : "unknown";
}

/** True when the requesting client is at least `min` (major.minor.patch). */
export function clientAtLeast(req: Request, min: string): boolean {
  return compareVersions(clientAppVersion(req), min) >= 0;
}
