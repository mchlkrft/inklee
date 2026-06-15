import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseDepositPolicy } from "@/lib/deposit-policy";
import { normalizeDepositPolicy } from "@/lib/mobile-settings";

export const runtime = "nodejs";

// GET /api/mobile/settings/deposit-policy — the artist's structured
// cancellation/refund policy (refund window, late-cancel forfeit %, optional
// last-minute 100% window). parseDepositPolicy supplies the conservative
// platform draft default when nothing is stored yet, mirroring the web
// deposits settings page.
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
  const settings = (data?.settings ?? {}) as Record<string, unknown>;

  return mobileOk(parseDepositPolicy(settings.deposit_policy));
}

// POST /api/mobile/settings/deposit-policy { refundWindow, lateCancelForfeitPct,
// lastMinute } — save the structured policy. Ports saveDepositPolicyAction:
// only the three constrained parameters are accepted, never free text.
// Reciprocity (artist cancels => full client refund) is hard-coded in the
// refund logic, not stored here, and not artist-overridable. Merged into the
// settings JSONB (no migration), same pattern as deposit-defaults.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = normalizeDepositPolicy(raw);
  if (!parsed.ok) return mobileError(400, parsed.error);

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const current = (profile.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({
      settings: { ...current, deposit_policy: parsed.value },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk(parsed.value);
}
