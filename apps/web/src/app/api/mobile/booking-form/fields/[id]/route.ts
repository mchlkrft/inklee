import {
  requireMobileUser,
  mobileOk,
  mobileError,
} from "@/lib/server/mobile-auth";
import { serviceClient } from "@/lib/supabase/service";
import { fieldConfigSchema } from "@/lib/custom-fields";
import {
  UUID_RE,
  fieldErrorMessage,
  normalizeFieldInput,
} from "@/lib/mobile-booking-form";

export const runtime = "nodejs";

// PATCH /api/mobile/booking-form/fields/:id — update a custom field. Port of
// the web updateFieldAction: same shared zod schema; the key is validated but
// intentionally never written (immutable after creation).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Field not found.", "not_found");
  }

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

  const { error } = await supabase
    .from("custom_fields")
    .update({
      // key is intentionally omitted — immutable after creation
      label: data.label,
      type: data.type,
      required: data.required,
      placeholder: data.placeholder ?? null,
      help_text: data.help_text ?? null,
      options: data.options,
    })
    .eq("id", id)
    .eq("artist_id", userId);
  if (error) return mobileError(500, error.message);

  return mobileOk({ ok: true });
}

// DELETE /api/mobile/booking-form/fields/:id — remove a custom field. Port of
// the web deleteFieldAction: soft delete (deleted_at + inactive) when any
// historical booking answered it, hard delete otherwise, then strip the id
// from profiles.settings.field_order. The submission count uses serviceClient
// exactly like the web — booking_requests rows aren't readable under the
// artist's RLS, and an RLS-scoped count would under-count and hard-delete a
// field history still references.
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireMobileUser(req);
  if (!auth.ok) return mobileError(auth.status, auth.error);
  const { userId, supabase } = auth;
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return mobileError(404, "Field not found.", "not_found");
  }

  const { data: field } = await supabase
    .from("custom_fields")
    .select("key")
    .eq("id", id)
    .eq("artist_id", userId)
    .single();
  if (!field) return mobileError(404, "Field not found.", "not_found");

  const { count } = await serviceClient
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", userId)
    .contains("form_data", { custom_answers: [{ key: field.key }] });

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("custom_fields")
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq("id", id)
      .eq("artist_id", userId);
    if (error) return mobileError(500, error.message);
  } else {
    const { error } = await supabase
      .from("custom_fields")
      .delete()
      .eq("id", id)
      .eq("artist_id", userId);
    if (error) return mobileError(500, error.message);
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("settings")
    .eq("id", userId)
    .single();
  const settings = (profile?.settings ?? {}) as Record<string, unknown>;
  if (Array.isArray(settings.field_order)) {
    const newOrder = (settings.field_order as string[]).filter((k) => k !== id);
    const { error } = await supabase
      .from("profiles")
      .update({ settings: { ...settings, field_order: newOrder } })
      .eq("id", userId);
    if (error) return mobileError(500, error.message);
  }

  return mobileOk({ ok: true });
}
