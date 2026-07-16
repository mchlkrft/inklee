import { mobileOk } from "@/lib/server/mobile-auth";
import { buildMobileAppConfig } from "@/lib/server/app-config";

export const runtime = "nodejs";

// GET /api/mobile/config?platform=android&version=0.2.0
//
// The server-driven config plane for installed builds (0.2.0+): the
// min-version kill-switch fields (identical semantics to the legacy
// /api/mobile/min-version, which older builds keep calling — both are built by
// buildMobileAppConfig so they can never disagree), a soft-update nudge, and
// the grouped capability kill list.
//
// UNAUTHENTICATED by design: fetched before (and regardless of) login, so a
// killed build is blocked even at the sign-in screen.
//
// FAIL-OPEN by design: unset env resolves to the disarmed defaults (min
// "0.0.0", nothing disabled). The client treats a missing/failed fetch the
// same way — a config outage can never degrade the fleet. Capability kills
// are ALSO enforced server-side in the core that performs the capability;
// this response only lets the client hide entry points and explain.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const platform =
    url.searchParams.get("platform") === "ios" ? "ios" : "android";
  const version = url.searchParams.get("version") ?? "0.0.0";

  const res = mobileOk(buildMobileAppConfig(platform, version));
  // CDN buffer against launch storms; a config flip still propagates within
  // ~1 minute of the deploy going live.
  res.headers.set(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300",
  );
  return res;
}
