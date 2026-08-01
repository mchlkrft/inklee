import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseFeatures } from "@/lib/features";

export const runtime = "nodejs";

// GET /api/mobile/goods/settings — the standalone shop checkout on/off toggle
// (decision S2, Plus build C5). Stored in `settings.features.shop_checkout`,
// mirroring the web /goods toggle. No native screen consumes this yet (a
// tracked gap, see docs/web-native-parity.md); the route exists so the wire
// is ready for whichever native slice adds the settings UI.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return mobileError(500, error?.message ?? "Profile not found.");
  }
  const settings = (data.settings ?? {}) as Record<string, unknown>;
  const features = parseFeatures(settings.features);
  return mobileOk({ shopCheckoutEnabled: features.shop_checkout });
}

// POST /api/mobile/goods/settings — save the toggle. Preserves goods_module +
// checkout_addons untouched; only writes shop_checkout.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const body = (raw ?? {}) as Record<string, unknown>;
  if (typeof body.shopCheckoutEnabled !== "boolean") {
    return mobileError(400, "shopCheckoutEnabled must be a boolean.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;
  const currentFeatures = parseFeatures(current.features);

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...current,
        features: {
          ...currentFeatures,
          shop_checkout: body.shopCheckoutEnabled,
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ shopCheckoutEnabled: body.shopCheckoutEnabled });
}
