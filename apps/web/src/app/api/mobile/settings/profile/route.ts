import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";

export const runtime = "nodejs";

// GET /api/mobile/settings/profile — the editable profile fields.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "slug, display_name, bio, timezone, location, logo_url, instagram_handle",
    )
    .eq("id", userId)
    .single();
  if (error || !data)
    return mobileError(404, "Profile not found.", "not_found");

  return mobileOk({
    slug: data.slug,
    displayName: data.display_name,
    bio: data.bio,
    timezone: data.timezone,
    location: data.location,
    logoUrl: data.logo_url,
    instagramHandle: data.instagram_handle,
  });
}
