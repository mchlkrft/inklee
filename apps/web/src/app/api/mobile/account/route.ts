import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import {
  deleteOwnAccountCore,
  isReauthFresh,
} from "@/lib/server/account-deletion";
import { isMfaEnabled } from "@inklee/shared/auth-derivations";
import type { MobileAccount } from "@inklee/shared/mobile-api";

export const runtime = "nodejs";

// Mirrors the (uncapped) web saveGeneralAction defensively — profiles name
// columns are plain text, so cap mobile input at a sane length.
const NAME_MAX = 80;

// GET /api/mobile/account — the account + security overview backing the app's
// Account & security screen (mirrors web settings/account/page.tsx): name
// fields, sign-in identity (password vs OAuth-only), and whether a verified
// TOTP factor exists. Read-only; 2FA enrolment itself stays on the web.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const [{ data: profile }, { data: userData }] = await Promise.all([
    supabase
      .from("profiles")
      .select("first_name, last_name, display_name, booking_mode")
      .eq("id", userId)
      .single(),
    // Full GoTrue user (identities + MFA factors) — requireMobileUser only
    // exposes the id, and the factors list is what drives the 2FA pill.
    supabase.auth.getUser(),
  ]);
  const user = userData.user;

  const identities = user?.identities ?? [];
  const hasPassword = identities.some((i) => i.provider === "email");
  const oauthProvider = hasPassword
    ? null
    : (identities.find((i) => i.provider !== "email")?.provider ?? null);
  const mfaEnabled = isMfaEnabled(user?.factors);

  const body: MobileAccount = {
    email: user?.email ?? null,
    firstName: profile?.first_name ?? null,
    lastName: profile?.last_name ?? null,
    displayName: profile?.display_name ?? null,
    bookingMode: profile?.booking_mode ?? "preferred_date",
    hasPassword,
    oauthProvider,
    mfaEnabled,
  };
  return mobileOk(body);
}

// PATCH /api/mobile/account { firstName?, lastName? } — save the artist's real
// name (the General section of web settings/account). Mirrors the name half of
// saveGeneralAction; the artist (display) name keeps its own editor at
// /api/mobile/settings/profile so a name save never clobbers it. An empty
// string clears the field (NULL), matching the web action. RLS own-row update.
export async function PATCH(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { firstName?: unknown; lastName?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName =
    typeof body.lastName === "string" ? body.lastName.trim() : "";
  if (firstName.length > NAME_MAX || lastName.length > NAME_MAX) {
    return mobileError(400, `Names can be at most ${NAME_MAX} characters.`);
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: firstName || null,
      last_name: lastName || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}

// DELETE /api/mobile/account — irreversibly delete the signed-in artist's
// account. The subject is ALWAYS the token's userId (no id is read from the body
// → no privilege escalation). Requires a literal type-to-confirm token AND a
// recent re-authentication (counsel §9): the app re-authenticates the user in
// the UI immediately before calling, and we verify it server-side via
// last_sign_in_at (set by Supabase on a real sign-in, not on token refresh), so
// a stolen-but-valid bearer token alone cannot self-delete the account. Per
// counsel §3 deletion is NOT blocked on financial state; a 500 is a transient
// error (e.g. Stripe briefly unreachable) the app surfaces as "try again".
export async function DELETE(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId } = auth;

  let body: { confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  if (body.confirm !== "DELETE") {
    return mobileError(400, "Type DELETE to confirm.", "confirm_required");
  }
  if (!isReauthFresh(auth.lastSignInAt)) {
    return mobileError(
      401,
      "Sign in again, then delete your account.",
      "reauth_required",
    );
  }

  const result = await deleteOwnAccountCore(userId, { surface: "mobile" });
  if (result.ok) return mobileOk({ deleted: true });
  return mobileError(500, result.message);
}
