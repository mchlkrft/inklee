import { mobileOk } from "@/lib/server/mobile-auth";
import type { MobileMinVersion } from "@inklee/shared/app-version";
import { buildMobileAppConfig } from "@/lib/server/app-config";

export const runtime = "nodejs";

// GET /api/mobile/min-version?platform=android&version=1.2.3
//
// The mobile min-version kill-switch. There is no OTA, so this is how a bad
// build (especially the first money-path build) gets recalled: raise the
// MOBILE_MIN_VERSION_* env var above the bad build's version and redeploy, and
// every older install shows a blocking "update required" screen on next launch.
//
// UNAUTHENTICATED by design: the app checks this before (and regardless of)
// login, so a killed build is blocked even at the sign-in screen.
//
// FAIL-OPEN by design (unlike the fail-closed security defaults elsewhere): an
// unset minimum resolves to "0.0.0" so nobody is blocked by a missing/mistyped
// env var. The switch only activates when a minimum is set above a build. A
// spoofed `version` only lets a client OPT OUT of its own update prompt, which
// is harmless (this is a UX recall, not a security control).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const platform =
    url.searchParams.get("platform") === "ios" ? "ios" : "android";
  const version = url.searchParams.get("version") ?? "0.0.0";

  // Single implementation shared with GET /api/mobile/config (0.2.0+ builds);
  // this legacy endpoint keeps serving pre-0.2.0 builds forever with the
  // narrower payload they compiled against.
  const config = buildMobileAppConfig(platform, version);
  const payload: MobileMinVersion = {
    minVersion: config.minVersion,
    updateRequired: config.updateRequired,
    updateUrl: config.updateUrl,
  };
  return mobileOk(payload);
}
