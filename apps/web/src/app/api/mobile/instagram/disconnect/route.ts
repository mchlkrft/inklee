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

  await disconnectInstagram(auth.userId);
  return mobileOk({ ok: true });
}
