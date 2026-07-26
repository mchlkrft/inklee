import { isCapabilityDisabled } from "@/lib/server/app-config";
import { tattooMapEnabled } from "@/lib/map-features";
import { mobileError } from "@/lib/server/mobile-auth";

// Shared gate for every /api/mobile/map/* route: the web launch flag (the map
// feature as a whole) AND the tattoo_map capability kill (the native surface's
// operational pause). The client hides its entry points on the same capability;
// this is the authoritative half.
export function mapMobileGate(): ReturnType<typeof mobileError> | null {
  if (!tattooMapEnabled()) {
    return mobileError(404, "The map is not available.", "not_found");
  }
  if (isCapabilityDisabled("tattoo_map")) {
    return mobileError(
      503,
      "The tattoo map is temporarily unavailable. Try again later.",
      "capability_disabled",
    );
  }
  return null;
}
