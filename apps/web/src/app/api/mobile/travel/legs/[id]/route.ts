import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { deleteTripLegCore } from "@/lib/server/guest-spots";

export const runtime = "nodejs";

// DELETE /api/mobile/travel/legs/:id — remove a trip leg. The shared core
// enforces ownership plus the guest spot lock: legs of live stays stay
// locked behind the cancel flow; terminal ones allow calendar cleanup.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId } = auth;
  const { id } = await params;

  const result = await deleteTripLegCore(userId, id);
  if (result.error) {
    if (result.error === "Trip stop not found.")
      return mobileError(404, result.error, "not_found");
    return mobileError(409, result.error, "locked");
  }

  return mobileOk({ ok: true });
}
