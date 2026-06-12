import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { DEFAULT_FORM_SETTINGS } from "@/lib/form-settings";

export const runtime = "nodejs";

// The 15 FormSettings booleans. The web saveFormSettingsAction relies on the
// TS-typed server-action boundary; this JSON route must allowlist the key or a
// hostile client could inject arbitrary keys into profiles.settings.form_settings.
const ALLOWED_KEYS = new Set(Object.keys(DEFAULT_FORM_SETTINGS));

// POST /api/mobile/booking-form/settings  { key, value } — flip one form
// setting (field visibility / required / photo annotations). Port of the web
// saveFormSettingsAction: read-modify-write merge that preserves sibling
// settings keys, with show_email and show_preferred_date forced true (email is
// the mandatory contact method, the date is the core booking mechanism).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { key?: unknown; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (typeof body.key !== "string" || !ALLOWED_KEYS.has(body.key)) {
    return mobileError(400, "Unknown form setting.");
  }
  if (typeof body.value !== "boolean") {
    return mobileError(400, "value must be a boolean.");
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  const formSettings = (settings.form_settings ?? {}) as Record<
    string,
    unknown
  >;

  const persistedValue =
    body.key === "show_preferred_date" || body.key === "show_email"
      ? true
      : body.value;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: {
        ...settings,
        form_settings: { ...formSettings, [body.key]: persistedValue },
      },
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
