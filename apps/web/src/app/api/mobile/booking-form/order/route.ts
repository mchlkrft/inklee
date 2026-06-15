import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { normalizeFieldOrder } from "@/lib/mobile-booking-form";

export const runtime = "nodejs";

// POST /api/mobile/booking-form/order  { order: string[] } — persist the full
// displayed key array (standard ids + custom uuids), exactly what the web
// drag-drop saves via saveFieldOrderAction. Written verbatim after the
// JSON-boundary minimum (bounded array of non-empty short strings); unknown
// keys are harmless — the public renderer skips ids it can't resolve and
// appends any it's missing.
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: { order?: unknown };
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }
  const parsed = normalizeFieldOrder(body.order);
  if (!parsed.ok) return mobileError(400, parsed.error);

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    return mobileError(500, readError?.message ?? "Profile not found.");
  }
  const settings = (profile.settings ?? {}) as Record<string, unknown>;

  const { error } = await supabase
    .from("profiles")
    .update({ settings: { ...settings, field_order: parsed.order } })
    .eq("id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}
