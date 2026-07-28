import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseConfirmationPage } from "@inklee/shared/confirmation-page";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { formCustomAllowed } from "@/lib/server/entitlement-gates";
import { saveConfirmationCore } from "@/lib/server/confirmation-write";

export const runtime = "nodejs";

// GET / POST /api/mobile/booking-form/confirmation — the native twin of the
// web confirmation-page editor. Both call the SAME saveConfirmationCore, so
// the entitlement refusal, the link validation and the merge-write cannot
// drift between surfaces.

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
  let entitled = false;
  try {
    entitled = formCustomAllowed(await getAccountOverrides(userId));
  } catch {
    entitled = false;
  }

  return mobileOk({
    confirmation: parseConfirmationPage(settings.confirmation_page),
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
  const b = (body ?? {}) as Record<string, unknown>;

  const result = await saveConfirmationCore(supabase, userId, {
    headline: b.headline,
    message: b.message,
    linkUrl: b.linkUrl,
    linkLabel: b.linkLabel,
  });
  if (!result.ok) {
    // 403 for the entitlement, 400 for a bad link, 500 for a real failure, so
    // the app can map `not_entitled` to IAP-safe copy via plan-errors.ts.
    const status =
      result.code === "not_entitled"
        ? 403
        : result.code === "invalid"
          ? 400
          : 500;
    return mobileError(status, result.error, result.code);
  }
  return mobileOk({ ok: true, confirmation: result.settings });
}
