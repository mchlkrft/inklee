import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseAppearance } from "@inklee/shared/appearance";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { appearanceCustomAllowed } from "@/lib/server/entitlement-gates";
import { saveAppearanceCore } from "@/lib/server/appearance-write";

export const runtime = "nodejs";

// GET/PATCH /api/mobile/settings/appearance — the native twin of the web
// appearance editor (Plus build P1b). Wraps the SAME saveAppearanceCore the
// web action uses, so entitlement, validation and the merge-write discipline
// cannot drift between surfaces.

export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data, error } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (error) return mobileError(500, error.message);

  let entitled = false;
  try {
    entitled = appearanceCustomAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  // Parsed with legacy read-through: the app opens showing the artist's real
  // current appearance, not an empty form.
  return mobileOk({ appearance: parseAppearance(data?.settings), entitled });
}

export async function PATCH(req: Request) {
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

  const result = await saveAppearanceCore(supabase, userId, {
    theme: body.theme,
    ...("accent" in body ? { accent: body.accent } : {}),
    font: body.font,
    buttonTreatment: body.buttonTreatment,
    buttonRadius: body.buttonRadius,
    surface: body.surface,
  });

  if (!result.ok) {
    const status = result.code === "not_entitled" ? 403 : 400;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({ appearance: result.settings });
}
