import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { disconnectInstagram } from "@/lib/server/instagram-sync";

export const runtime = "nodejs";

// POST /api/mobile/instagram/disconnect — full teardown (token row + posts +
// cached thumbnails). Idempotent. Already-imported designs survive.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);

  try {
    await disconnectInstagram(auth.userId);
  } catch {
    return mobileError(
      502,
      "Disconnecting Instagram failed. Try again.",
      "disconnect_failed",
    );
  }
  return mobileOk({ ok: true });
}
