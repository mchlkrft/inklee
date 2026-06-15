import { revalidatePath } from "next/cache";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseBioPageSettings } from "@/lib/bio-page-settings";

export const runtime = "nodejs";

// GET /api/mobile/settings/hub — the artist's Inklee Hub (bio page) config for the
// native editor. Reads profiles.settings.bio_page and returns it through the SAME
// shared parser the web editor + public render use (parseBioPageSettings), so all
// three surfaces agree on shape, URL safety, length caps, module-key filtering,
// and per-platform social dedupe. One source of truth — do NOT re-derive here.
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
  return mobileOk(parseBioPageSettings(settings.bio_page));
}

// POST /api/mobile/settings/hub — save the Hub config. Ports the web
// saveBioPageAction: round-trip the body through parseBioPageSettings (the single
// place every field is validated + sanitized), then merge into
// profiles.settings.bio_page WITHOUT clobbering the rest of the settings JSON.
// RLS-scoped to the artist. Returns the SANITIZED settings so the native editor
// reflects exactly what was stored (dropped links, normalized URLs, deduped
// socials), matching the web form's round-trip.
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
  // Guard against a malformed body silently resetting the whole config: the
  // parser treats any non-object as DEFAULT_BIO_PAGE, which would wipe it.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return mobileError(400, "Invalid request body.");
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

  // Merge the incoming hub fields onto the current bio_page. The Link Hub editor
  // owns headline/text/links/socials; bookingPolicy + module visibility
  // (`hidden`) are edited on /bookings/settings. Spreading currentBio first
  // preserves those, and spreading the body last keeps older clients that still
  // send them working (backward compatible). One shared parser validates all.
  const settings = parseBioPageSettings({
    ...currentBio,
    ...(raw as Record<string, unknown>),
  });

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, bio_page: settings },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  // The public Hub (/<slug>/hub) is server-rendered; bust its cache so an edit
  // from the app shows immediately, mirroring saveBioPageAction's revalidate.
  if (profile.slug) revalidatePath(`/${profile.slug}/hub`);

  return mobileOk(settings);
}
