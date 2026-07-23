import { getAccountOverrides } from "@/lib/entitlements-server";
import { brandingRemoved } from "./entitlement-gates";

// Whether to hide the public "made with Inklee" footer for an artist (a Plus
// perk, dark-launched via the `branding` capability). FAIL-SAFE: a plan-read
// blip keeps the footer, because a public page must never 500 over a cosmetic
// gate (getAccountOverrides is fail-loud by money-path design; here we swallow).
export async function publicBrandingHidden(artistId: string): Promise<boolean> {
  try {
    return brandingRemoved(await getAccountOverrides(artistId));
  } catch {
    return false;
  }
}
