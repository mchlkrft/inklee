import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseDepositDefaults } from "@/lib/deposit-settings";

export const runtime = "nodejs";

// GET /api/mobile/settings/deposit-defaults — the artist's default deposit
// amount / due-days / note that pre-fill the deposit-request form.
export async function GET(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  const { data } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;

  return mobileOk(parseDepositDefaults(settings.deposit_defaults));
}
