import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { parseDepositDefaults } from "@/lib/deposit-settings";
import { normalizeDepositDefaults } from "@/lib/mobile-settings";

export const runtime = "nodejs";

// GET /api/mobile/settings/deposit-defaults — the artist's default deposit
// amount / due-days / note that pre-fill the deposit-request form.
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

  return mobileOk(parseDepositDefaults(settings.deposit_defaults));
}

// POST /api/mobile/settings/deposit-defaults { amount?, dueDays, note? } — save
// the per-artist deposit defaults that pre-fill the deposit-request form. Ports
// saveDepositDefaultsAction; merged into settings JSONB (no migration).
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

  const parsed = normalizeDepositDefaults(raw);
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
      settings: { ...current, deposit_defaults: parsed.value },
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk(parsed.value);
}
