import * as Sentry from "@sentry/nextjs";
import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { fieldConfigSchema } from "@/lib/custom-fields";
import { buildDefaultFieldOrder, insertFieldId } from "@/lib/form-settings";
import {
  fieldErrorMessage,
  normalizeFieldInput,
} from "@/lib/mobile-booking-form";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "@/lib/server/entitlement-gates";

export const runtime = "nodejs";

// POST /api/mobile/booking-form/fields — create a custom field. Port of the web
// createFieldAction (apps/web/src/app/(artist)/bookings/form/actions.ts):
// same shared zod schema, same max-position append, same 23505 duplicate-key
// message, same field_order merge (insert before image_upload / preferred_date).
export async function POST(req: Request) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return mobileError(400, "Invalid JSON body.");
  }

  const parsed = fieldConfigSchema.safeParse(normalizeFieldInput(body));
  if (!parsed.success) {
    return mobileError(400, fieldErrorMessage(parsed.error.issues[0]));
  }
  const data = parsed.data;

  // Entitlement cap (BM-2.0), same gate as the web action so the two surfaces
  // can't drift. Dark-launched via entitlement_caps; fail open on a plan-read
  // blip (a soft cap, not money).
  try {
    const overrides = await getAccountOverrides(userId);
    const { count } = await supabase
      .from("custom_fields")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", userId)
      .is("deleted_at", null);
    const gate = capState(overrides, "custom_fields", count ?? 0);
    if (gate.blocked) {
      return mobileError(
        403,
        `You've reached the ${gate.cap}-field limit on your current plan. Upgrade to Plus to add more.`,
        "cap_reached",
      );
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "custom_fields_cap_check_mobile" },
      extra: { artistId: userId },
    });
  }

  // Max position over live fields (deleted_at null), like the web action.
  const { data: existing } = await supabase
    .from("custom_fields")
    .select("position")
    .eq("artist_id", userId)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);
  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("custom_fields")
    .insert({
      artist_id: userId,
      key: data.key,
      label: data.label,
      type: data.type,
      required: data.required,
      placeholder: data.placeholder ?? null,
      help_text: data.help_text ?? null,
      options: data.options,
      active: true,
      position,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return mobileError(400, `A field with key "${data.key}" already exists.`);
    }
    return mobileError(500, error.message);
  }

  // Merge the new id into profiles.settings.field_order so the public form
  // shows it (before image_upload, else preferred_date, else appended). The
  // field already exists at this point, so this whole block is best-effort
  // like the web createFieldAction: a merge failure must NOT fail the request
  // (a retry would hit the 23505 duplicate-key path for a field that is live),
  // and a failed settings read must NOT feed an empty object into the update
  // (that would wipe every other settings key). The GET's append-missing logic
  // renders the field either way.
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  if (readError || !profile) {
    console.error(
      "[mobile/booking-form] field_order merge skipped, settings read failed",
      readError?.message,
    );
    return mobileOk({ ok: true, id: inserted.id as string });
  }
  const settings = (profile.settings ?? {}) as Record<string, unknown>;
  let order: string[];
  if (Array.isArray(settings.field_order)) {
    order = settings.field_order as string[];
  } else {
    const { data: allFields } = await supabase
      .from("custom_fields")
      .select("id")
      .eq("artist_id", userId)
      .is("deleted_at", null)
      .order("position", { ascending: true });
    order = buildDefaultFieldOrder(
      (allFields ?? []).map((f) => f.id as string),
    );
  }
  const { error: orderError } = await supabase
    .from("profiles")
    .update({
      settings: { ...settings, field_order: insertFieldId(order, inserted.id) },
    })
    .eq("id", userId);
  if (orderError) {
    console.error(
      "[mobile/booking-form] field_order merge failed",
      orderError.message,
    );
  }

  return mobileOk({ ok: true, id: inserted.id as string });
}
