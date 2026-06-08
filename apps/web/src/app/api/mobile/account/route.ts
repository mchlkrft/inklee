import {
  requireMobileUser,
  mobileError,
  mobileOk,
} from "@/lib/server/mobile-auth";
import { deleteOwnAccountCore } from "@/lib/server/account-deletion";

export const runtime = "nodejs";

// DELETE /api/mobile/account — irreversibly delete the signed-in artist's
// account. The subject is ALWAYS the token's userId (no id is read from the body
// → no privilege escalation). Requires a literal type-to-confirm token; the app
// also re-authenticates the user before calling. Returns 409 (nothing mutated)
// when paid-unresolved deposits / a non-zero Connect balance exist.
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

  const result = await deleteOwnAccountCore(userId, { surface: "mobile" });
  if (result.ok) return mobileOk({ deleted: true });
  if (result.code === "MONEY_NOT_RESOLVED") {
    return mobileError(409, result.message, "money_not_resolved");
  }
  return mobileError(500, result.message);
}
