import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import {
  deleteOwnAccountCore,
  isReauthFresh,
} from "@/lib/server/account-deletion";

export const runtime = "nodejs";

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
