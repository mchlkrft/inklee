import { revalidatePath } from "next/cache";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import {
  parseBioPageSettings,
  type BioModuleKey,
} from "@/lib/bio-page-settings";

export const runtime = "nodejs";

// GET /api/mobile/settings/shop-visibility — whether the shop teaser shows on
// the artist's public booking page (decision S2, Plus build C5). A sibling of
// /api/mobile/settings/booking-policy, same shape: `hidden: ["shop"]` lives in
// the shared bio_page model but is a booking-page concern, so it is read/
// written here rather than through the Link Hub editor's routes. Governs ONLY
// the booking-page teaser; the standalone shop's own on/off switch is
// `settings.features.shop_checkout` (a separate route, /api/mobile/goods/settings).
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
  const bio = parseBioPageSettings(settings.bio_page);
  return mobileOk({ show: !bio.hidden.includes("shop") });
}

// POST /api/mobile/settings/shop-visibility — save the toggle. Preserves the
// rest of bio_page (bookingPolicy, blocks, socials, every other hidden key);
// only touches the `shop` visibility flag. RLS-scoped to the artist.
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
  if (typeof body.show !== "boolean") {
    return mobileError(400, "show must be a boolean.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("slug, settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;
  const currentBio = parseBioPageSettings(current.bio_page);

  const hidden: BioModuleKey[] = currentBio.hidden.filter((k) => k !== "shop");
  if (!body.show) hidden.push("shop");

  const settings = parseBioPageSettings({ ...currentBio, hidden });

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  if (profile.slug) revalidatePath(`/${profile.slug}`);

  return mobileOk({ show: !settings.hidden.includes("shop") });
}
