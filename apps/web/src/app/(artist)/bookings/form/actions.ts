"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { fieldConfigSchema, labelToKey } from "@/lib/custom-fields";
import { buildDefaultFieldOrder, insertFieldId } from "@/lib/form-settings";
import { getAccountOverrides } from "@/lib/entitlements-server";
import { capState } from "@/lib/server/entitlement-gates";

type State = { error: string } | { success: true } | null;

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createFieldAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };

  const raw = {
    key: (formData.get("key") as string).trim(),
    label: (formData.get("label") as string).trim(),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    placeholder:
      (formData.get("placeholder") as string | null)?.trim() || undefined,
    help_text:
      (formData.get("help_text") as string | null)?.trim() || undefined,
    options: parseOptions(formData.get("options") as string | null),
  };

  const parsed = fieldConfigSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const data = parsed.data;

  // Auto-generate key from label if left blank
  const key = data.key || labelToKey(data.label);

  // Entitlement cap (BM-2.0): block a NEW field past the tier limit.
  // Dark-launched via the entitlement_caps capability; existing fields are never
  // touched (the count only gates creation). Fail OPEN on a plan-read blip: a
  // soft cap must not block field creation the way the money path would.
  try {
    const overrides = await getAccountOverrides(user.id);
    const { count } = await supabase
      .from("custom_fields")
      .select("id", { count: "exact", head: true })
      .eq("artist_id", user.id)
      .is("deleted_at", null);
    const gate = capState(overrides, "custom_fields", count ?? 0);
    if (gate.blocked) {
      return {
        error: `You've reached the ${gate.cap}-field limit on your current plan. Upgrade to Plus to add more.`,
      };
    }
  } catch (e) {
    Sentry.captureException(e, {
      tags: { action: "custom_fields_cap_check" },
      extra: { artistId: user.id },
    });
  }

  // Get max position
  const { data: existing } = await supabase
    .from("custom_fields")
    .select("position")
    .eq("artist_id", user.id)
    .is("deleted_at", null)
    .order("position", { ascending: false })
    .limit(1);

  const position = (existing?.[0]?.position ?? -1) + 1;

  const { data: inserted, error } = await supabase
    .from("custom_fields")
    .insert({
      artist_id: user.id,
      key,
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
    if (error.code === "23505")
      return { error: `a field with key "${key}" already exists` };
    return { error: error.message };
  }

  // Append new field ID to field_order in artist settings
  {
    const { data: profile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", user.id)
      .single();

    const settings = (profile?.settings ?? {}) as Record<string, unknown>;
    let existingOrder: string[];
    if (Array.isArray(settings.field_order)) {
      existingOrder = settings.field_order as string[];
    } else {
      // Build default from all existing custom fields
      const { data: allFields } = await supabase
        .from("custom_fields")
        .select("id")
        .eq("artist_id", user.id)
        .is("deleted_at", null)
        .order("position", { ascending: true });
      existingOrder = buildDefaultFieldOrder(
        (allFields ?? []).map((f) => f.id as string),
      );
    }
    const newOrder = insertFieldId(existingOrder, inserted.id);

    await supabase
      .from("profiles")
      .update({ settings: { ...settings, field_order: newOrder } })
      .eq("id", user.id);
  }

  revalidatePath("/bookings/form");
  return { success: true };
}

export async function updateFieldAction(
  _prev: State,
  formData: FormData,
): Promise<State> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };

  const id = formData.get("id") as string;
  if (!id) return { error: "Missing field id." };

  const raw = {
    key: (formData.get("key") as string).trim(),
    label: (formData.get("label") as string).trim(),
    type: formData.get("type"),
    required: formData.get("required") === "on",
    placeholder:
      (formData.get("placeholder") as string | null)?.trim() || undefined,
    help_text:
      (formData.get("help_text") as string | null)?.trim() || undefined,
    options: parseOptions(formData.get("options") as string | null),
  };

  const parsed = fieldConfigSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

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
    .eq("artist_id", user.id);

  if (error) {
    if (error.code === "23505")
      return { error: `a field with that key already exists` };
    return { error: error.message };
  }

  revalidatePath("/bookings/form");
  return { success: true };
}

export async function toggleFieldActiveAction(
  id: string,
  active: boolean,
): Promise<State> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase
    .from("custom_fields")
    .update({ active })
    .eq("id", id)
    .eq("artist_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/bookings/form");
  return { success: true };
}

export async function reorderFieldAction(
  id: string,
  direction: "up" | "down",
): Promise<State> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: fields } = await supabase
    .from("custom_fields")
    .select("id, position")
    .eq("artist_id", user.id)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (!fields) return { error: "Not found." };

  const idx = fields.findIndex((f) => f.id === id);
  if (idx === -1) return { error: "Not found." };

  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= fields.length) return { success: true };

  const { error } = await supabase.rpc("reorder_custom_field", {
    p_field_id: fields[idx].id,
    p_direction: direction,
  });

  if (error) return { error: error.message };

  revalidatePath("/bookings/form");
  return { success: true };
}

export async function deleteFieldAction(id: string): Promise<State> {
  const { supabase, user } = await getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: field } = await supabase
    .from("custom_fields")
    .select("key")
    .eq("id", id)
    .eq("artist_id", user.id)
    .single();

  if (!field) return { error: "Not found." };

  // Check if any booking has a custom answer with this key
  const { count } = await serviceClient
    .from("booking_requests")
    .select("id", { count: "exact", head: true })
    .eq("artist_id", user.id)
    .contains("form_data", { custom_answers: [{ key: field.key }] });

  if ((count ?? 0) > 0) {
    // Soft delete: preserve for historical bookings
    const { error } = await supabase
      .from("custom_fields")
      .update({ deleted_at: new Date().toISOString(), active: false })
      .eq("id", id)
      .eq("artist_id", user.id);
    if (error) return { error: error.message };
  } else {
    // Hard delete: no submissions reference this field
    const { error } = await supabase
      .from("custom_fields")
      .delete()
      .eq("id", id)
      .eq("artist_id", user.id);
    if (error) return { error: error.message };
  }

  // Remove field from field_order
  {
    const { data: profile } = await supabase
      .from("profiles")
      .select("settings")
      .eq("id", user.id)
      .single();

    const settings = (profile?.settings ?? {}) as Record<string, unknown>;
    if (Array.isArray(settings.field_order)) {
      const newOrder = (settings.field_order as string[]).filter(
        (k) => k !== id,
      );
      await supabase
        .from("profiles")
        .update({ settings: { ...settings, field_order: newOrder } })
        .eq("id", user.id);
    }
  }

  revalidatePath("/bookings/form");
  return { success: true };
}

function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (o): o is string => typeof o === "string" && o.trim() !== "",
    );
  } catch {
    return [];
  }
}
