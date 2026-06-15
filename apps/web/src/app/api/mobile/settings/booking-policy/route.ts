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

// GET /api/mobile/settings/booking-policy — the artist's booking-policy text +
// whether it shows on the public booking page. Stored in the shared bio_page
// model (profiles.settings.bio_page) but edited under booking settings (it is a
// booking-page concern, not a Link Hub one), mirroring the web
// /bookings/settings booking-policy form. One source of truth via the shared
// parser; do NOT re-derive.
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
  return mobileOk({
    bookingPolicy: bio.bookingPolicy,
    show: !bio.hidden.includes("policy"),
  });
}

// POST /api/mobile/settings/booking-policy — save the policy text + visibility.
// Preserves the rest of bio_page (headline/text/links/socials, owned by the Link
// Hub editor); only touches bookingPolicy + the `policy` visibility flag.
// RLS-scoped to the artist.
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
  const bookingPolicy =
    typeof body.bookingPolicy === "string" ? body.bookingPolicy : null;
  const show = body.show !== false; // default to shown

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

  const hidden: BioModuleKey[] = currentBio.hidden.filter(
    (k) => k !== "policy",
  );
  if (!show) hidden.push("policy");

  const settings = parseBioPageSettings({
    ...currentBio,
    bookingPolicy,
    hidden,
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  if (profile.slug) revalidatePath(`/${profile.slug}`);

  return mobileOk({
    bookingPolicy: settings.bookingPolicy,
    show: !settings.hidden.includes("policy"),
  });
}
