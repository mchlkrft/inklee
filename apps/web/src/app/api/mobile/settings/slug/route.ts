import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { formCustomAllowed } from "@/lib/server/entitlement-gates";
import { renameSlugCore } from "@/lib/server/slug-rename";
import { publicArtistUrl } from "@/lib/public-url";

export const runtime = "nodejs";

// GET / POST /api/mobile/settings/slug — the native twin of the web slug
// rename. Both call renameSlugCore, so the entitlement rule, the reserved
// list, the service-role availability check and the unique-violation handling
// are the same code on both surfaces.

export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("slug")
    .eq("id", userId)
    .single();
  if (error || !data) {
    return mobileError(500, error?.message ?? "Profile not found.");
  }

  let entitled = false;
  try {
    entitled = formCustomAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  const slug = (data.slug as string | null) ?? null;
  return mobileOk({
    slug,
    // Server-derived so the app never rebuilds the public URL itself (it has
    // been wrong about the host before: inklee.app vs inkl.ee).
    publicUrl: slug ? publicArtistUrl(slug) : null,
    entitled,
  });
}

export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const result = await renameSlugCore(
    supabase,
    userId,
    (body as Record<string, unknown>)?.slug,
  );
  if (!result.ok) {
    const status =
      result.code === "not_entitled"
        ? 403
        : result.code === "failed"
          ? 500
          : 400;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({
    ok: true,
    slug: result.slug,
    publicUrl: publicArtistUrl(result.slug),
  });
}
