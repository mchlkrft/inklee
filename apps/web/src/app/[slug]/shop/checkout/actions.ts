"use server";

import { headers } from "next/headers";
import { serviceClient } from "@/lib/supabase/service";
import { isGoodsCommerceEnabled, shopCheckoutEnabled } from "@/lib/features";
import { checkShopCheckoutRateLimit } from "@/lib/ratelimit";
import { getClientIp } from "@/lib/get-client-ip";
import {
  createStandaloneGoodsCheckoutCore,
  type BundleSelection,
} from "@/lib/server/goods-checkout";
import type { AddonSelection } from "@/lib/orders";

// PUBLIC, UNAUTHENTICATED action (GC1 slice C3): a guest buyer starts a
// standalone shop checkout. Thin on purpose — every money decision (catalog,
// prices, stock, discount, fee, charge floor, Connect readiness) lives in
// createStandaloneGoodsCheckoutCore; this adds only what a public entry point
// needs: the park-switch double-gate, an IP rate limit (public-submit rule),
// and slug -> artist resolution.

export type ShopCheckoutActionResult =
  | { ok: true; orderId: string; clientSecret: string; totalMinor: number }
  | { ok: false; error: string };

export async function startShopCheckoutAction(input: {
  slug: string;
  email: string;
  selections: AddonSelection[];
  bundles?: BundleSelection[];
  discountCode?: string;
}): Promise<ShopCheckoutActionResult> {
  // Double gate: the page 404s when parked, and the action refuses too, so a
  // held request from before a park cannot start a checkout after it.
  if (!isGoodsCommerceEnabled()) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }

  const slug = String(input.slug ?? "").trim();
  if (!slug) return { ok: false, error: "This shop could not be found." };

  const { data: artist } = await serviceClient
    .from("profiles")
    .select("id, settings")
    .eq("slug", slug)
    .maybeSingle();
  if (!artist) return { ok: false, error: "This shop could not be found." };

  // Decision S2, same double-gate shape as the park switch above: the page
  // 404s when the artist's own toggle is off, and the action refuses too, so
  // a held request from before the artist turned it off cannot start a
  // checkout after. The core re-checks this again (the money path's own
  // authority); this is defense in depth, not the only gate.
  if (!shopCheckoutEnabled(artist.settings)) {
    return { ok: false, error: "The shop isn't taking card orders yet." };
  }
  const artistId = artist.id as string;

  // Public-submit rate limit, keyed by caller IP + the target artist so one
  // shop being hammered does not consume another's budget. Its own bucket, so
  // buyer retries never eat the booking form's limit for the same IP.
  const ip = getClientIp(await headers());
  const limit = await checkShopCheckoutRateLimit(ip, artistId);
  if (!limit.allowed) {
    return {
      ok: false,
      error: "Too many attempts. Please wait a moment and try again.",
    };
  }

  return createStandaloneGoodsCheckoutCore({
    artistId,
    clientEmail: String(input.email ?? ""),
    selections: Array.isArray(input.selections) ? input.selections : [],
    bundles: Array.isArray(input.bundles) ? input.bundles : [],
    discountCode:
      typeof input.discountCode === "string" ? input.discountCode : undefined,
  });
}
